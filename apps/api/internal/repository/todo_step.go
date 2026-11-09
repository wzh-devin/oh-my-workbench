package repository

type TodoStep struct {
	TodoRecord
	TodoID   int64
	Title    string
	Done     bool
	Position int
}

func (TodoStep) TableName() string { return "omw_todo_step" }

type TodoStepRepository struct{ *Store }

func (r *TodoStepRepository) Replace(userID, todoID int64, steps []TodoStep) error {
	if err := r.Delete(userID, todoID); err != nil {
		return err
	}
	if len(steps) > 0 {
		return r.db.Create(&steps).Error
	}
	return nil
}

func (r *TodoStepRepository) Delete(userID, todoID int64) error {
	return r.db.Where("user_id = ? AND todo_id = ?", userID, todoID).Delete(&TodoStep{}).Error
}
