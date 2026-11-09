package assets

const AlwaysRule = `{"schemaVersion":1,"root":{"kind":"constant","value":true}}`

func ValidSort(value string) bool {
	switch value {
	case "name", "name-desc", "date", "date-asc", "size", "size-asc", "opened", "created", "created-asc":
		return true
	}
	return false
}
