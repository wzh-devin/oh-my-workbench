package repository

import "context"

type NoteRevision struct {
	NoteRecord
	NoteID         int64
	NoteVersion    int
	BodyCiphertext []byte
	KeyID          string
}

func (NoteRevision) TableName() string { return "omw_note_revision" }

func (r *NoteRevisionRepository) Revisions(ctx context.Context, user, note int64) ([]NoteRevision, error) {
	out := []NoteRevision{}
	err := r.db.WithContext(ctx).Select("id,note_id,note_version,created_at").Where("user_id=? AND note_id=?", user, note).Order("created_at DESC,id DESC").Limit(50).Find(&out).Error
	return out, err
}

func (r *NoteRevisionRepository) Revision(ctx context.Context, user, note, id int64) (NoteRevision, error) {
	var out NoteRevision
	err := r.db.WithContext(ctx).Where("user_id=? AND note_id=? AND id=?", user, note, id).First(&out).Error
	return out, notesMissing(err)
}

type NoteRevisionRepository struct{ *Store }
