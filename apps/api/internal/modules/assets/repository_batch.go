// 批量操作在短事务内完成元数据变更，物理内容删除交给持久化清理任务。
package assets

import (
	"context"
	"encoding/json"
	"time"
)

func (r *Repository) Batch(ctx context.Context, userID int64, input BatchInput) (Operation, error) {
	var result Operation
	err := r.Write(ctx, userID, func(tx *Repository) error {
		var existing Operation
		found := tx.db.Where("user_id=? AND request_key=?", userID, input.RequestKey).First(&existing)
		if found.Error == nil {
			var previous BatchInput
			if json.Unmarshal(existing.Payload, &previous) != nil {
				return ErrConflict
			}
			before, _ := json.Marshal(previous)
			after, _ := json.Marshal(input)
			if string(before) != string(after) {
				return ErrConflict
			}
			result = existing
			return nil
		}
		if missing(found.Error) != ErrNotFound {
			return found.Error
		}
		selected := []Entry{}
		selectedMap := map[int64]bool{}
		var connectionID int64
		for _, item := range input.Entries {
			id, _ := parseID(item.ID)
			e, err := tx.entry(userID, id)
			if err != nil {
				return err
			}
			if e.Version != item.Version {
				return ErrConflict
			}
			if connectionID != 0 && connectionID != e.ConnectionID {
				return ErrInvalid
			}
			connectionID = e.ConnectionID
			selected = append(selected, e)
			selectedMap[id] = true
		}
		c, err := tx.connection(userID, connectionID)
		if err != nil || !c.Enabled {
			return ErrNotFound
		}
		all, err := tx.entries(userID, connectionID)
		if err != nil {
			return err
		}
		entries := entryMap(all)
		roots := []Entry{}
		for _, e := range selected {
			nested := false
			for id := range selectedMap {
				if descendantOf(e, id, entries) {
					nested = true
					break
				}
			}
			if !nested {
				roots = append(roots, e)
			}
		}
		if input.Action == "star" {
			roots = selected
		}
		parent, err := parentID(input.ParentID)
		if err != nil {
			return err
		}
		if input.Action == "move" || input.Action == "copy" {
			target, err := parseID(input.ConnectionID)
			if err != nil || target != connectionID {
				return ErrInvalid
			}
			targetDepth, err := directoryDepth(parent, entries)
			if err != nil {
				return err
			}
			for _, root := range roots {
				if parent != nil && (*parent == root.ID || descendantOf(entries[*parent], root.ID, entries)) {
					return ErrInvalid
				}
				sourceDepth, err := directoryDepth(root.ParentID, entries)
				if err != nil {
					return err
				}
				for _, e := range all {
					if e.ID == root.ID || descendantOf(e, root.ID, entries) {
						depth := 0
						for p := e.ParentID; p != nil; {
							depth++
							v, ok := entries[*p]
							if !ok {
								return ErrInvalid
							}
							p = v.ParentID
						}
						if targetDepth+depth-sourceDepth >= 64 {
							return ErrInvalid
						}
					}
				}
			}
		}
		now := time.Now().UTC()
		removed := []int64{}
		for _, root := range roots {
			hidden := hiddenEntry(root, entries)
			if input.Action == "delete" || input.Action == "restore" {
				if !hidden {
					return ErrInvalid
				}
			} else if hidden {
				return ErrNotFound
			}
			switch input.Action {
			case "trash":
				root.TrashedAt = &now
			case "restore":
				if root.TrashedAt == nil {
					continue
				}
				if root.ParentID != nil {
					p, ok := entries[*root.ParentID]
					if !ok || hiddenEntry(p, entries) {
						root.ParentID = nil
					}
				}
				root.Name = copyName(entries, root.ParentID, root.Name, root.Kind == "folder")
				root.TrashedAt = nil
			case "move":
				if !nameAvailable(entries, parent, root.Name, root.ID) {
					return ErrName
				}
				root.ParentID = parent
			case "star":
				root.Starred = input.Starred
			case "delete":
				for _, e := range all {
					if e.ID == root.ID || descendantOf(e, root.ID, entries) {
						removed = append(removed, e.ID)
					}
				}
				continue
			case "copy":
				continue
			}
			root.NormalizedName = normalizeName(root.Name)
			root.Version++
			root.UpdatedAt = now
			if err := tx.db.Save(&root).Error; err != nil {
				return err
			}
			entries[root.ID] = root
		}
		// 批量校验共享对象并批量写入，复制大目录不产生逐文件 SQL。
		if input.Action == "copy" {
			copied, ids := cloneSubtrees(userID, all, roots, parent)
			for offset := 0; offset < len(ids); offset += 1000 {
				batch := ids[offset:min(offset+1000, len(ids))]
				var count int64
				if err := tx.db.Model(&Blob{}).Where("user_id=? AND connection_id=? AND id IN ? AND status='ready' AND verified_at IS NOT NULL", userID, connectionID, batch).Count(&count).Error; err != nil {
					return err
				}
				if count != int64(len(batch)) {
					return ErrConflict
				}
			}
			if err := tx.db.CreateInBatches(&copied, 500).Error; err != nil {
				return err
			}
		}
		if len(removed) > 0 {
			// 分批绑定参数，整棵目录仍在同一事务中原子删除。
			for offset := 0; offset < len(removed); offset += 1000 {
				batch := removed[offset:min(offset+1000, len(removed))]
				if err := tx.db.Where("user_id=? AND id IN ?", userID, batch).Delete(&Entry{}).Error; err != nil {
					return err
				}
			}
			if err := tx.db.Model(&Blob{}).Where("user_id=? AND connection_id=? AND status='ready' AND NOT EXISTS (SELECT 1 FROM omw_asset_entry e WHERE e.blob_id=omw_asset_blob.id)", userID, connectionID).Updates(map[string]any{"status": "cleaning", "next_retry_at": now, "updated_at": now}).Error; err != nil {
				return err
			}
		}
		payload, _ := json.Marshal(input)
		status := "completed"
		if input.Action == "delete" {
			var pending int64
			if err := tx.db.Model(&Blob{}).Where("user_id=? AND connection_id=? AND status='cleaning'", userID, connectionID).Count(&pending).Error; err != nil {
				return err
			}
			if pending > 0 {
				status = "cleaning"
			}
		}
		result = Operation{Base: base(userID), ConnectionID: connectionID, Kind: input.Action, Status: status, RequestKey: input.RequestKey, Payload: payload}
		return tx.db.Create(&result).Error
	})
	return result, err
}
