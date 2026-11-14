# Release signing
`gaurav-os.jks` + `keystore.properties` sign the release APK. **Back both up** — Android only accepts
`adb install -r` updates when the signing key is identical. Both are git-ignored.
