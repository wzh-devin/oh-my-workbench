package assets

import "strconv"

func FormatID(id int64) string { return strconv.FormatInt(id, 10) }

func ParseID(value string) (int64, error) {
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id <= 0 || FormatID(id) != value {
		return 0, ErrInvalid
	}
	return id, nil
}

func ParentID(value *string) (*int64, error) {
	if value == nil {
		return nil, nil
	}
	id, err := ParseID(*value)
	return &id, err
}
