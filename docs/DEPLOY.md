# Going live: API on Render, website on Vercel

```
 visitor ──▶ Vercel (website, apps/web) ──▶ Render (API, apps/api) ──▶ Neon (database, Singapore)
 phone app ───────────────────────────────▶ Render
```

The browser only ever talks to the website; the website forwards calls to the API. The phone app talks to the API
directly.

**Cost:** Render Starter about $7/month plus $0.25/month for the 1 GB uploads disk. Vercel's free (Hobby) plan is for
non-commercial use only, so a business site needs Vercel Pro (about $20/month). The Neon free plan is fine to start with.

You need: the GitHub repo `santosh-alta/elevate` pushed, a Render account, a Vercel account, the Neon project
"elevate", and an email account that can send mail (for login codes).

---

## 1. Get the Neon connection string

1. Open console.neon.tech → project **elevate** → **Connect**.
2. Turn **Connection pooling** OFF and copy the string (its host has no `-pooler`). This is your `DATABASE_URL`.

## 2. Get email sending ready (required)

In production, login codes are sent only by email, so nobody can sign in without this.

The easiest option for an `@altaschool.tech` Google Workspace account:
1. Turn on 2-Step Verification for the account that will send (for example `events@altaschool.tech`).
2. Go to myaccount.google.com/apppasswords → create an app password named "Elevate".
3. Your `SMTP_URL` is `smtps://events@altaschool.tech:<app-password-without-spaces>@smtp.gmail.com:465`
   (write `@` in the username as `%40`, i.e. `events%40altaschool.tech`).
4. Your `MAIL_FROM` is `Alta School of Technology <events@altaschool.tech>`.

Google allows about 2,000 emails a day. For bigger events, switch later to a sending service such as Resend or Brevo:
just change `SMTP_URL`.

## 3. Create the API on Render

1. dashboard.render.com → **New** → **Blueprint** → connect GitHub → pick **elevate**.
2. Render reads `render.yaml` and shows the service **elevate-api**. Fill in:
   - `DATABASE_URL`: from step 1
   - `API_PUBLIC_URL`: `https://elevate-api.onrender.com` (if Render gives the service a different address, put
     that one here after the first deploy)
   - `WEB_PUBLIC_URL`: leave empty for now (filled in step 5)
   - `SMTP_URL`, `MAIL_FROM`: from step 2
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`: your Razorpay **test** keys (or empty)
   - `ANTHROPIC_API_KEY`: optional
3. Click **Apply**. The first deploy installs packages, creates all the database tables, and starts the API.
4. Check that `https://<your-api-address>/health` shows `{"ok":true}`.

## 4. Create the website on Vercel

1. vercel.com → **Add New** → **Project** → import **elevate** from GitHub.
2. **Project Name:** `alta-events` (this becomes the temporary address `alta-events.vercel.app`).
3. **Root Directory:** click **Edit** → choose `apps/web`. Framework: **Next.js** (detected automatically).
4. **Environment Variables:** `API_URL` = your Render address, e.g. `https://elevate-api.onrender.com` (no `/v1`).
5. Click **Deploy**. Note the address Vercel gives you under **Domains**.

## 5. Connect the two

1. Render → **elevate-api** → **Environment** → set `WEB_PUBLIC_URL` to the Vercel address, e.g.
   `https://alta-events.vercel.app` → **Save** (Render redeploys).

## 6. Create Alta and your admin account

Render → **elevate-api** → **Shell**, then run (with your own email and name):

```bash
npm run bootstrap -w @elevate/api -- --brand altaschool \
  --admin you@altaschool.tech --name "Your Name" --platform \
  --domain event.altaschool.tech --temp-domain alta-events.vercel.app
```

This creates the Alta brand with its theme and contact details, makes `alta-events.vercel.app` open Alta's site, and
makes you an admin. It never deletes anything, so you can run it again safely (for example to add another admin).
**Never run `db:seed` against this database:** it wipes everything and loads demo data.

Open `https://alta-events.vercel.app/admin`, enter your email, and sign in with the code that arrives.

## 7. Sign-in: Google, GitHub and email code

All three can be on at once; each button appears on the sign-in page as soon as its keys are on Render. Nothing is
needed on Vercel. People who use different methods with the same email end up in the same account.

**Email code** works as soon as `SMTP_URL` is set (step 2).

**Google**
1. console.cloud.google.com → create a project named **Elevate**.
2. **APIs & Services** → **OAuth consent screen** → **External** → app name "Alta School of Technology Events", support
   email → scopes `openid`, `email`, `profile` → **Publish app**.
3. **Credentials** → **Create credentials** → **OAuth client ID** → **Web application** → **Authorized redirect URIs**:
   - `https://alta-events.vercel.app/api/auth/google/callback`
   - later also `https://event.altaschool.tech/api/auth/google/callback`
4. Put the Client ID and secret on Render as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

**GitHub**
1. github.com → your photo → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**
   (or the same under an organization's settings, so it isn't tied to one person).
2. Application name "Alta School of Technology Events"; Homepage URL `https://alta-events.vercel.app`;
   Authorization callback URL `https://alta-events.vercel.app/api/auth/github/callback` → **Register application**.
3. **Generate a new client secret**. Put the Client ID and secret on Render as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

A GitHub OAuth App allows only one callback address. When Alta moves to `event.altaschool.tech`, change the callback URL
to `https://event.altaschool.tech/api/auth/github/callback`. Each additional brand domain needs its own GitHub OAuth App.

## 8. Roles

| Role | Can do |
|---|---|
| Super admin (platform admin) | Everything, in every brand; creates brands |
| Admin | Everything in the brand: people and roles, settings, payments, approving events |
| Moderator | Approves or sends back event pages, edits any event |
| Event manager (staff) | Creates and runs events without approval |
| Organizer | Creates event pages; each one is hidden until an admin or moderator approves it, and is free unless an admin allows paid registration |
| User | Signs up, registers for events |

Change roles in **Admin → Brand settings → Team & roles**. Organizers press **Submit for review** on their event; reviewers
get an email and see it under **Review queue**. Approving publishes the page; sending it back emails the organizer the note.

## 9. Razorpay webhook

Razorpay dashboard → **Settings** → **Webhooks** → **Add New Webhook**:
- URL: `https://<your-api-address>/v1/webhooks/razorpay`
- Secret: the same value as `RAZORPAY_WEBHOOK_SECRET`
- Events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`

## 10. Later: Alta's own domain (event.altaschool.tech)

1. Vercel → project → **Settings** → **Domains** → add `event.altaschool.tech`.
2. In altaschool.tech's DNS, add the CNAME Vercel shows (`event` → `cname.vercel-dns.com`).
3. In Elevate **Admin → Settings → Domains**, add the TXT record shown there, then press **Verify**.

From then on, emails and certificates link to `event.altaschool.tech`. Every new brand (Sunstone, Mirai, …) follows
the same three steps with its own domain.

---

## Known limits for now

- **Uploads bigger than about 4.5 MB fail** through the website, because Vercel caps request size. Moving photo
  uploads to Cloudinary (planned) removes this limit. The phone app talks to Render directly, so it isn't affected.
- Uploaded files live on Render's 1 GB disk. They survive deploys and restarts, but the API can only run as a single
  instance until uploads move to Cloudinary.
- Render redeploys the API on every push to `main`, and Vercel redeploys the website on every push. Database
  migrations run automatically before each new API version starts.
