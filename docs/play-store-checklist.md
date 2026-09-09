# Google Play Store - Restricted Permissions Declaration Checklist

This document details the sensitive permissions RoadSOS requests, mapped directly to their in-app functionality. You will need this information when filling out the App Content -> Sensitive Permissions declarations in the Google Play Console.

> **IMPORTANT COMPLIANCE NOTE**: Emergency/safety-alert apps have historically had a path to approval for SMS/Call permissions under Play's policy exceptions (e.g., "Apps that provide critical safety alerts"). However, this is NOT guaranteed. Google Play's restricted-permissions policy is extremely strict and subject to change. The actual submission must be reviewed against the current policy at submission time.

## 1. SMS and Phone Call Logs (`SEND_SMS`, `CALL_PHONE`)

* **Permission:** `SEND_SMS`, `CALL_PHONE`
* **Requested in App:** `AndroidManifest.xml`
* **Feature:** Emergency SOS Auto-Dial and Alerting
* **Justification for Play Console:** The app serves as a critical road safety and emergency response tool. When a crash is detected via sensor fusion, or the user manually triggers an SOS, the app automatically dispatches an SMS with their live GPS coordinates and places an automated phone call to the user's predefined emergency contacts.
* **Why the Twilio/Cloud webhook isn't enough:** The app has a cloud webhook fallback, but if the user has no internet connection (e.g., stranded in a rural area), the app MUST fallback to native cellular SMS and Phone Dialing to ensure the emergency signal gets out. This is a life-safety feature.

## 2. Background Location (`ACCESS_BACKGROUND_LOCATION`)

* **Permission:** `ACCESS_BACKGROUND_LOCATION`
* **Requested in App:** `AndroidManifest.xml`
* **Feature:** Crash Detection & Live Emergency Tracking
* **Justification for Play Console:** The app uses background location to monitor vehicle speed and correlate it with sudden accelerometer impacts to accurately detect car crashes while the phone is locked in the user's pocket or dashboard. Additionally, when an active SOS incident is triggered, the app must broadcast the user's changing location to first responders and emergency contacts even when the app is minimized.

## 3. Contacts (`READ_CONTACTS`)

* **Permission:** `READ_CONTACTS`
* **Requested in App:** `AndroidManifest.xml`
* **Feature:** Emergency Contact Selection & Driving Mode Filtering
* **Justification for Play Console:** Users must be able to select trusted family members and friends from their phone book to act as their Emergency Contacts. Furthermore, during "Driving Mode", the app intercepts incoming calls and automatically replies with a "driver is busy" message only if the caller exists in the user's Contacts (to prevent replying to spam).

## 4. Microphone (`RECORD_AUDIO`)

* **Permission:** `RECORD_AUDIO`
* **Requested in App:** `AndroidManifest.xml`
* **Feature:** Silent Safety Word (Offline Wake Word)
* **Justification for Play Console:** To assist users in distress scenarios where they cannot touch the screen (e.g., being followed, or trapped after a crash), the app listens for a specific, user-defined offline safety word to trigger a silent SOS.

---

### Before Submitting:
1. Ensure the Privacy Policy URL is pasted into the Play Console under **App Content -> Privacy Policy**.
2. Be prepared to record a video demonstrating the Crash Detection/SOS workflow and the Driving Mode feature if the Play Console review team requests proof of the core functionality.
