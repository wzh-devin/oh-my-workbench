package value

import (
	"fmt"
	"strconv"
	"strings"
)

// Number is an exact, normalized decimal. Its bounds also bound comparison cost.
type Number struct {
	negative bool
	digits   string
	exponent int
}

func ParseNumber(text string) (Number, error) {
	var n Number
	if len(text) == 0 || len(text) > 256 {
		return n, fmt.Errorf("number must contain at most 256 bytes")
	}
	if text[0] == '-' {
		n.negative = true
		text = text[1:]
	}
	mantissa, exponentText, hasExponent := strings.Cut(strings.ToLower(text), "e")
	if hasExponent {
		exponent, err := strconv.Atoi(exponentText)
		if err != nil || exponent < -10000 || exponent > 10000 {
			return n, fmt.Errorf("number exponent exceeds ±10000")
		}
		n.exponent = exponent
	}
	whole, fraction, _ := strings.Cut(mantissa, ".")
	if whole == "" {
		return n, fmt.Errorf("invalid decimal")
	}
	for _, c := range whole + fraction {
		if c < '0' || c > '9' {
			return n, fmt.Errorf("invalid decimal")
		}
	}
	n.digits = strings.TrimLeft(whole+fraction, "0")
	n.exponent -= len(fraction)
	if n.digits == "" {
		return Number{digits: "0"}, nil
	}
	trimmed := strings.TrimRight(n.digits, "0")
	n.exponent += len(n.digits) - len(trimmed)
	n.digits = trimmed
	return n, nil
}

func (n Number) Compare(other Number) int {
	if n.digits == "0" && other.digits == "0" {
		return 0
	}
	if n.negative != other.negative {
		if n.negative {
			return -1
		}
		return 1
	}
	result := 0
	if n.digits == "0" {
		result = -1
	} else if other.digits == "0" {
		result = 1
	} else {
		left, right := len(n.digits)+n.exponent, len(other.digits)+other.exponent
		if left < right {
			result = -1
		} else if left > right {
			result = 1
		} else {
			for i := 0; i < max(len(n.digits), len(other.digits)); i++ {
				a, b := byte('0'), byte('0')
				if i < len(n.digits) {
					a = n.digits[i]
				}
				if i < len(other.digits) {
					b = other.digits[i]
				}
				if a < b {
					result = -1
					break
				}
				if a > b {
					result = 1
					break
				}
			}
		}
	}
	if n.negative {
		return -result
	}
	return result
}

func (n Number) String() string {
	prefix := ""
	if n.negative {
		prefix = "-"
	}
	if n.exponent == 0 {
		return prefix + n.digits
	}
	return prefix + n.digits + "e" + strconv.Itoa(n.exponent)
}
