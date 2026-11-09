package assets

func SameParent(a, b *int64) bool { return a == nil && b == nil || a != nil && b != nil && *a == *b }
