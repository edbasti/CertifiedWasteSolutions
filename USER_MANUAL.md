# Certified Waste Solutions — User Manual

This guide explains how to use Certified Waste Solutions day to day. No technical background is needed.

The system follows one simple flow:

1. **Plan stops** — Office staff set up locations and assign routes.
2. **Track work** — Drivers update stop status, notes, and photos in the field.
3. **Close the books** — Managers review driver logs and create invoices.

---

## Who uses what

| Role | What you mainly do | Where you land after login |
|------|--------------------|----------------------------|
| **Driver** | Run today’s route and submit a driver log | Today’s stops |
| **Manager** | Plan routes, watch progress, review logs, invoice | Operations portal |
| **Admin** | Everything a manager can do, plus manage drivers | Operations portal |

Use a web browser on a phone, tablet, or computer. Drivers usually work from a phone.

---

## Getting started

### Sign in

1. Open the Certified Waste Solutions website.
2. Choose **Login to portal** (or **Open portal** if you are already signed in).
3. Enter your email and password.
4. Choose **Sign in**.

If sign-in fails, check the email spelling and password. If your account was turned off, ask an administrator to reactivate you.

### Sign out

On any signed-in page, choose **Sign out** in the top bar.

### What you see after login

- **Drivers** go to their stop list for the service day.
- **Managers and admins** go to the **Operations** portal with tabs such as Locations, Routes, Logs, and Reports.
- **Admins** also see **Drivers** and **NetSuite**.

---

## Requirement 1: Give every driver a clear daily stop list

**Goal:** Each driver knows where to go, in what order, with live status.

### For managers / admins — set up locations

1. Open the portal and choose the **Locations** tab.
2. Under **New location**, enter the **Name** and **Address**.
3. Choose **Add location**.

**Edit a location**

1. In the Locations list, choose **Edit**.
2. Change the name or address in the popup.
3. Choose **Save location**, or **Cancel** / **Close** to leave without saving.

**Turn a location off or on**

- Choose **Deactivate** so it stays off new routes (existing history remains).
- Choose **Reactivate** when it should be available again.

**Import many locations at once**

1. Prepare a spreadsheet saved as CSV with columns: `name`, `address` (optional: `active`).
2. On Locations, choose the CSV file under **Import locations**.
3. Read the green notice to confirm how many were added or updated.

### For managers / admins — build a route for a day

1. Open the **Routes** tab.
2. Set the **Service date** (the day the work happens).
3. Under **Add a stop**:
   - Pick the **driver**.
   - Choose a saved **location**, or type a one-off customer name and address.
   - Enter **pickup** details if needed.
4. Save / add the stop.
5. Repeat until the driver’s day is planned.

**Import many stops at once**

CSV columns: `driverEmail`, `serviceDate`, `customer`, `pickup`  
Optional: `address`, `sequence`

**Adjust a route before work starts**

For stops still **Not started**, you can move them up/down or **Remove** them.  
Once a driver has progressed a stop, treat it as field work in progress.

### For drivers — view your day

1. After login you see **Today’s stops**.
2. Confirm the **service date** at the top (change it if you need another day).
3. Read each stop: customer, address, pickup info, and status.
4. Use the progress line (for example “3 of 8 complete”) to see how the day is going.

If the list is empty, you are not assigned for that date — contact the office.

**Route update alerts**

If the office changes your route, you may see a notification. Open it to jump to that service date.

---

## Requirement 2: Live status updates on every stop

**Goal:** The office and driver share the same picture of Not started → En route → Completed.

### For drivers — run the route

1. Choose **Get started** (or open the first stop that is not done). That marks work as **En route**.
2. When you finish the stop, mark it **Complete**.
3. Open **Status history** on a stop if you need to see who changed status and when.

Statuses in plain language:

| Status | Meaning |
|--------|---------|
| **Not started** | Not yet begun |
| **En route** | On the way / working this stop |
| **Completed** | Done |

### For managers / admins — watch live progress

1. Open **Routes** and pick the service date.
2. Use the summary counts (not started / en route / completed).
3. Expand a stop’s **Activity** to see status history, notes, and photos from the driver.

---

## Requirement 3: Capture notes and photos in the field

**Goal:** Record what happened once, with the stop — no paper chase later.

### For drivers

1. Open the stop you are working.
2. Add a **note** if something important happened (access issue, customer request, exception, and so on).
3. Add **photos** from the camera or gallery when proof or context helps.
4. Notes and photos stay attached to that stop for the office to review.

### For managers / admins

On **Routes**, open a stop’s activity to review notes and photos.  
On **Reports**, completed stops can also show this detail for past work.

---

## Requirement 4: Flexible stop order

**Goal:** Drivers (and the office, before work starts) can adjust sequence when the day changes.

### For drivers

On your day list, use move **up** / **down** controls when you need a different order (for traffic, customer readiness, or office direction).

### For managers / admins

On **Routes**, reorder or remove stops that are still **Not started**.

---

## Requirement 5: Driver logs for billing

**Goal:** Drivers submit a daily log; the office turns it into an invoice with a clear trail.

### For drivers — fill and submit the log

1. From the day view, open the **Driver log** for that service date (or go to the log page for the date).
2. Choose the log type:
   - **Independent Driver Log (Non-Port)** — standard jobs
   - **Independent Driver Log (Port)** — port / terminal jobs
3. Enter **Driver / Company Name** at the top.
4. Add at least one **line** (ticket / load row). Fill every required field for that log type.
5. Choose **Save draft** if you need to come back later.
6. When finished, choose **Submit log**.

After submit, the log is locked for you. The office reviews it. If they correct something, you can see the **Corrections** history.

**Non-port lines — typically need**

- Date printed on the Certified Recycling weight ticket  
- Company name  
- Whether it is a multi-stop load  
- Ticket number  
- Price  

**Port lines — typically need**

- Ticket date and ticket number  
- Multi-stop load flag  
- Company name / booking number  
- Terminal empty out, chassis number, container number, terminal load in (as applicable)  
- Comments (if needed)  
- Price  

**If submit is blocked**

Common fixes: add a company name at the top, add at least one line, and make sure each line has ticket date, ticket number, and price (plus company/booking fields for that log type).

### For managers / admins — review logs and create invoices

1. Open the **Logs** tab.
2. Under **Submitted logs**, open a log that is waiting.
3. Enter the payment date:
   - Non-port: **Date Paid**
   - Port: **Payment Date (Friday)**
4. Choose **Complete log** to move it toward invoicing.
5. Download **Invoice PDF** and/or **Log PDF** as needed.
6. Choose **Send to accounting** when ready (if email is not configured, the system still records the send step and you can download the files).

**Find an older invoice**

Use **Find an invoice** with driver name and service date.

**Correct a mistake after review**

1. Open the log.
2. Update company name, payment date, and/or line prices as allowed.
3. Choose **Save correction**.  
   The system keeps a history of what changed.

**Status meanings on logs**

| Status | Meaning |
|--------|---------|
| **Draft** | Driver still working on it |
| **Waiting for the manager** | Submitted; needs office action |
| **Ready for invoice** | Reviewed; ready to invoice |
| **Invoiced** | Invoice created |
| **Corrected** | Office changed something after the original submit |

---

## Requirement 6: Reports on completed work

**Goal:** See what finished across drivers and customers, with timing and export.

### For managers / admins

1. Open the **Reports** tab.
2. Optionally filter by **Driver**, **Customer**, and date range (**From** / **To**).
3. Run the report.
4. Review averages between status changes and each completed stop’s detail (including notes/photos when present).
5. Choose **Download CSV** if you need the data in a spreadsheet.

---

## Requirement 7: Manage who can sign in (administrators)

**Goal:** Only the right people have access; passwords can be reset safely.

### Create a driver

1. Open the **Drivers** tab (admins only).
2. Under **New driver**, enter name, email, company name (optional), and a password (at least 8 characters).
3. Choose **Create driver**.  
   Share the email and temporary password with the driver securely.

### Edit a driver

1. Choose **Edit** on the driver row.
2. Update name, email, or company in the popup.
3. Choose **Save driver**.

### Deactivate / reactivate

- **Deactivate** turns the account off and ends their current sign-in.
- **Reactivate** lets them sign in again.

### Reset access (new password)

1. On the driver row, enter a **New password**.
2. Choose **Reset access**.  
   Previous sign-ins are ended; the driver uses the new password next time.

### Import drivers

CSV columns: `name`, `email`, `password`  
Optional: `companyName`, `active`

---

## Requirement 8: NetSuite status (administrators)

**Goal:** See whether NetSuite is connected for future automated stops.

1. Open the **NetSuite** tab (admins only).
2. Read the current status. Today, stops still come from **CSV import** or **manual add** on Routes.
3. Credential slots show whether values are set (the secret values themselves stay hidden).

When NetSuite is fully connected later, this tab is where connection status and mapping notes will live. Until then, keep using Routes import / add stop.

---

## Quick reference — CSV imports

| Import | Tab | Required columns | Optional |
|--------|-----|------------------|----------|
| Locations | Locations | `name`, `address` | `active` |
| Drivers | Drivers (admin) | `name`, `email`, `password` | `companyName`, `active` |
| Route stops | Routes | `driverEmail`, `serviceDate`, `customer`, `pickup` | `address`, `sequence` |

Tip: Open your spreadsheet app, fill one header row with these exact names, then **Save as CSV** before importing.

---

## Everyday checklists

### Driver — start of day

- [ ] Sign in  
- [ ] Confirm the correct service date  
- [ ] Review stop list and any route alerts  
- [ ] Use **Get started** on the first stop  

### Driver — end of day

- [ ] Mark remaining stops complete  
- [ ] Open the driver log for that date  
- [ ] Fill company name and all ticket lines  
- [ ] **Submit log**  

### Manager — plan the day

- [ ] Locations up to date  
- [ ] Routes built for the service date (manual or CSV)  
- [ ] Drivers notified if anything changed  

### Manager — close the books

- [ ] Check Routes for unfinished stops  
- [ ] Open **Logs** → submitted queue  
- [ ] Enter payment date → **Complete log**  
- [ ] Download PDFs / **Send to accounting**  
- [ ] Run **Reports** if leadership needs a summary  

### Admin — access hygiene

- [ ] Create or import new drivers before their first day  
- [ ] Reset access when someone forgets a password  
- [ ] Deactivate people who leave  

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| Cannot sign in | Recheck email/password; ask admin if the account is inactive |
| Driver sees no stops | Wrong service date, or office has not assigned a route yet |
| Edit button “does nothing” | A popup should open — look for the dialog in the center of the screen; on phone it may sit near the bottom |
| Cannot submit log | Fill company name, at least one line, and required ticket/price fields |
| Log will not let me edit | Already submitted — ask the manager to correct it if needed |
| Deactivate / save fails on the live site | Tell your technical contact; nested API updates may need a deploy fix |
| Invoice not found | Search with the same driver spelling and exact service date used on the log |

---

## Training accounts (demo only)

If your team uses the demo seed data, every demo password is `demo-password`:

| Email | Role |
|-------|------|
| jordan@cws.local | Admin |
| chino@cws.local | Manager |
| alex.rivera@cws.local | Driver (includes a sample September 30 route) |
| sam.thompson@cws.local | Driver |

Do not use demo passwords for real production accounts.

---

## Need help?

Start with your office manager for route and log questions.  
Ask an administrator for sign-in, password reset, or new driver setup.  
Ask your technical contact for website outages or errors that mention the system could not save or load data.
