package wireguard

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"

	"golang.zx2c4.com/wireguard/wgctrl/wgtypes"
)

// GenerateKeyPair generates a new WireGuard key pair
func GenerateKeyPair() (privateKey, publicKey string, err error) {
	key, err := wgtypes.GeneratePrivateKey()
	if err != nil {
		return "", "", fmt.Errorf("failed to generate private key: %w", err)
	}

	privateKey = key.String()
	publicKey = key.PublicKey().String()

	return privateKey, publicKey, nil
}

// GeneratePrivateKey generates a new WireGuard private key
func GeneratePrivateKey() (string, error) {
	privateKey, _, err := GenerateKeyPair()
	return privateKey, err
}

// DerivePublicKey derives the public key from a private key
func DerivePublicKey(privateKeyStr string) (string, error) {
	privateKey, err := wgtypes.ParseKey(privateKeyStr)
	if err != nil {
		return "", fmt.Errorf("invalid private key: %w", err)
	}

	return privateKey.PublicKey().String(), nil
}

// ValidateKey validates a WireGuard key (private or public)
func ValidateKey(keyStr string) error {
	_, err := wgtypes.ParseKey(keyStr)
	return err
}

// GeneratePresharedKey generates a preshared key for additional security
func GeneratePresharedKey() (string, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return "", fmt.Errorf("failed to generate preshared key: %w", err)
	}
	return base64.StdEncoding.EncodeToString(key), nil
}
