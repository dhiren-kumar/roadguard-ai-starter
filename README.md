# RoadGuard AI

RoadGuard AI is a learning prototype for edge-based road-damage scanning, contributor reports and an administrator review workflow.

## Stack

- Frontend: HTML, CSS and JavaScript
- API: Node.js and Express
- Database: MongoDB with Mongoose
- Authentication: bcrypt password hashes, email verification and signed JWT bearer tokens
- Edge inference: ONNX Runtime Web in the browser (requires your trained `model/best.onnx` file)
- Map: Leaflet and OpenStreetMap

## Run locally

1. Install Node.js 20 or later.
2. Clone this repository and run `npm install`.
3. Copy `.env.example` to `.env` and fill in real values. Never commit `.env`.
4. In MongoDB Atlas, create a database user and allow the IP address of the machine/server that will connect. Use the actual connection string in `MONGODB_URI`; do not leave the example placeholders.
5. Configure a Gmail App Password (or another supported SMTP provider) in `EMAIL_USER` and `EMAIL_PASS`.
6. Set `API_BASE_URL=http://localhost:5000` for local use.
7. Run `npm run check`, then `npm start`.
8. Open `http://localhost:5000`. Do not use a separate static server for authenticated API features; the Express server serves the frontend and API together.

## Create the first administrator

Registration creates contributor accounts only. To provision the first admin, temporarily set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 12 characters), and optional `ADMIN_NAME` in the local environment, then run:

```bash
npm run create-admin
```

Remove `ADMIN_PASSWORD` from the environment after the command completes. Sign in through `login.html` using that admin email and password. Never expose admin credentials in HTML or JavaScript.

## Authentication and API

- `POST /api/auth/register` — create a contributor account; sends a single-use email verification link.
- `GET /api/auth/verify-email?token=...` — verify the email address. The raw verification token is not stored in MongoDB.
- `POST /api/auth/login` — verify password and email status; returns a short-lived JWT.
- `GET /api/auth/me` — current signed-in user.
- `POST /api/reports` — verified contributors only.
- `GET /api/reports` — admin only.
- `GET /api/reports/public` — public reports approved for public display.
- `PATCH /api/reports/:id/status` — admin only.

Protected API requests use `Authorization: Bearer <token>`. Passwords are hashed with bcrypt; they are never returned by the API. JWT secret, MongoDB URI and email credentials must be set as environment variables.

## Deploy to Render

- Set the build command to `npm install`.
- Set the start command to `npm start`.
- Add `MONGODB_URI`, a random `JWT_SECRET` (32+ characters), `JWT_EXPIRES_IN=2h`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_SERVICE=gmail`, `API_BASE_URL=https://YOUR-SERVICE.onrender.com`, and `CLIENT_ORIGIN=https://YOUR-SERVICE.onrender.com` in Render Environment.
- Create the admin once from a trusted local terminal using the same production `MONGODB_URI` and admin environment values; do not leave `ADMIN_PASSWORD` configured on the public web service.
- Ensure the MongoDB Atlas network access list allows the Render service to connect. Do not publish database credentials or JWT secrets.

## Important limitations

- Put your actual trained ONNX model at `model/best.onnx`. The model output layout, class order and preprocessing in the current scanner must match the model you trained; an arbitrary ONNX file will not work.
- The scanner currently keeps captures in browser local storage until the contributor submits them. Browser storage can be cleared and is not a durable offline queue.
- Report photos are currently stored as base64 strings in MongoDB for prototype simplicity. A production deployment should move photos to object storage and store only a validated URL.
- Configure email delivery and test the verification link from the deployed service before inviting users.
- Use HTTPS in production. Browser camera and GPS permissions generally require HTTPS or localhost.
- Run integration tests against a disposable MongoDB database before production use. This repository has not been exercised against your live MongoDB, SMTP account, Render environment or trained model by this code change.

## Security notes

Never add real passwords, API keys, database URIs, JWT secrets or email app passwords to source files. Rotate any secret that was previously committed or shared. JWTs are stored in session storage by this prototype and should be treated as sensitive; a production-grade deployment should consider secure, HttpOnly, SameSite cookies and corresponding CSRF protections.
