# RoadGuard AI — starter prototype

## What is included
- Responsive HTML/CSS/JavaScript interface for laptop and mobile browsers.
- Camera capture and GPS capture using browser permissions.
- Report submission with image, coordinates, damage type, severity and description.
- Admin demo login and report review workflow: pending → approved → under construction → resolved / rejected.
- Public map showing **approved** reports with severity colours.
- A clearly marked function where the trained MobileNet edge model should be connected.

## Run it
1. Extract this folder.
2. Open a terminal in this folder.
3. Run a local static server, for example:
   - `python -m http.server 5500`
   - or VS Code Live Server.
4. Open `http://localhost:5500`.
5. Allow camera and location permissions. On a phone, use HTTPS or localhost; browsers normally block camera/GPS on ordinary insecure HTTP pages.

## Demo admin login
- Email: `admin@roadguard.local`
- Password: `RoadGuard@123`

## Important prototype limitations
This is a front-end learning prototype. Reports are saved in the browser's `localStorage`, so they are not shared between devices and may be lost when browser storage is cleared. The demo admin password is visible in JavaScript and is NOT secure. Contributor login, password hashing, email verification, server-side authorization, database storage, image upload and audit logs are not implemented yet. Do not deploy this as a real public service.

## Next production steps
1. Create an Express backend with MongoDB (or PostgreSQL/PostGIS) and proper user/admin roles.
2. Implement email verification and secure sessions/JWT; store password hashes with bcrypt/Argon2.
3. Store photos in object storage and save their URLs in the database.
4. Add a server-side geospatial duplicate check. For example, search within a configurable 25 m radius and update/link an existing unresolved road issue instead of creating a duplicate. Keep resolved history rather than overwriting it.
5. Train and validate a road-damage MobileNet model. Export a quantized TensorFlow Lite model and run it locally on the device (or use TensorFlow.js if converted for browser inference). Only send the prediction, confidence, image and GPS to the server after user consent.
6. Add admin audit history and filters for status, severity, date and area.

## MobileNet integration
Open `js/app.js` and find `runEdgeDamageDetection(imageDataUrl)`. Replace the TODO with model loading and inference. A generic ImageNet MobileNet model is not automatically a road-damage detector: it must be trained/fine-tuned on labelled road-damage images and evaluated for your target classes.
