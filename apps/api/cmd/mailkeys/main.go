// mailkeys prints deployment keys; it never edits environment files or the database.
package main

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	webpush "github.com/SherClockHolmes/webpush-go"
	"log"
)

func main() {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		log.Fatal(err)
	}
	private, public, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("MAIL_ENCRYPTION_KEY=%s\nWEB_PUSH_VAPID_PUBLIC_KEY=%s\nWEB_PUSH_VAPID_PRIVATE_KEY=%s\n", base64.StdEncoding.EncodeToString(key), public, private)
}
