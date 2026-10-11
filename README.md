# PIXCEL — 3D photography portfolio

Node.js + Express + SQLite backend. Front end is plain HTML/CSS/JS with Three.js (no build step).

## Run locally
```bash
npm install
copy .env.example .env      # Mac/Linux: cp .env.example .env
```
Open `.env` and put a long random value after `SESSION_SECRET=` (generate one with
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). Then:
```bash
npm run create-admin        # asks for admin email + password (12+ chars, stored as a bcrypt hash)
npm start
```
Site: http://localhost:3000 · Admin: http://localhost:3000/admin.html (also the small lock icon in the nav bar)

## Using the dashboard
- **Upload photographs:** choose one or many files, set title/category, choose Publish or Draft and whether public download is allowed, then Upload all.
- **Manage photographs:** edit, replace the image file, publish/unpublish, reorder with the arrows, delete (with confirmation).
- **Categories:** add, rename, change description, delete. Deleting a category keeps its photographs (they become uncategorised).
- **Profile & About:** profile photo, name, About text, interests, contact email, social links. Empty fields are hidden publicly.
- **Messages:** contact-form messages are stored here. (They are not emailed.)

## How photos are stored
- Your **original** is saved privately in `storage/originals/` and is never served directly. It is only sent through `/api/photos/:id/download`, and only if the photograph is published AND download is allowed (checked on the server).
- The website uses two optimized WebP copies in `storage/media/` (640 px thumbnail, 2000 px viewer image) with location/EXIF data removed.
- Files are verified by decoding them as images; names are random.

## Deploy
1. Use a server with a persistent disk (a small VPS is simplest). Back up the whole `storage/` folder: it holds the database, originals and media.
2. Set `NODE_ENV=production` and `SESSION_SECRET` in `.env`; optionally `DATA_DIR` to put storage elsewhere.
3. Run behind HTTPS (Caddy or Nginx). Production cookies are `Secure`, and HTTP requests are redirected to HTTPS.
4. Keep it running with `pm2 start server.js --name pixcel`, then `pm2 save`.
5. Run `npm run create-admin` on the server. Re-run it to reset the password.

## Security built in
bcrypt hashes; server-side sessions (HttpOnly, SameSite=Strict, regenerated at login); CSRF token on every admin change; rate limits on login, contact form and downloads; strict Helmet CSP; input validation; honeypot + duplicate check on the contact form.

## Notes and limits
- Sessions are in memory: admins are signed out when the server restarts.
- The camera sways around its vertical axis (about ±40°) instead of spinning fully, so the lens stays facing the visitor.
- Passwords use bcrypt rather than Argon2id (no native build needed).
- `sharp` and `better-sqlite3` install prebuilt binaries on common systems; if `npm install` fails, send me the error text.
- Nothing is invented: name, About text, email and social links come from the dashboard. The About text starts with the suggested introduction from the brief; edit it as you like.
