# Certified Waste Solutions — User Manual

This guide explains how to use Certified Waste Solutions day to day. No technical background is needed.

The system follows one simple flow:

1. **Plan stops** — Office staff set up customers/locations and assign routes (including NetSuite dispatch files).
2. **Track work** — Drivers update stop status, notes, and photos in the field.
3. **Close the books** — Managers review driver logs and create invoices.

---

## What’s new (recent updates)

| Change | What it means for you |
|--------|------------------------|
| **Left-hand portal menu** | Operations uses a sidebar (Dashboard, Routes & Stops, Driver Logs, Invoices, Reports, Customers, Drivers, NetSuite), not a row of tabs across the top. |
| **Edit opens a popup** | **Edit** on a customer or driver opens a dialog in the center of the screen (or near the bottom on a phone). You do not scroll to the top of the page. |
| **Sign out to switch accounts** | **Sign out** clears your session and takes you to the sign-in page so you can try another profile (for example admin → driver). |
| **Driver Logs vs Reports** | **Driver Logs** = Independent Driver Logs (port / non-port) after drivers submit. **Reports** = completed route stops only. **Invoices** = find/send finished invoices. |
| **Independent Driver Log (driver)** | After stops, drivers open **Independent Driver Log** on their day screen, fill ticket lines, and submit. |
| **NetSuite dispatch files** | Managers and admins can **import** and **export** Dispatch Truck Reports as **Excel (.xlsx)** or **CSV**, then assign NetSuite driver names to portal drivers. |
| **Dashboard** | Today’s overview of stops, completion, and recent activity. |

---

## Who uses what

| Role | What you mainly do | Where you land after login |
|------|--------------------|----------------------------|
| **Driver** | Run today’s route and submit a driver log | Today’s stops |
| **Manager** | Plan routes, watch progress, review logs, invoice, NetSuite files | Operations portal |
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

### Sign out (and switch to another profile)

1. Choose **Sign out** (top bar on driver pages, or bottom of the portal sidebar).
2. You are taken to the **Sign in** page.
3. Enter the other person’s email and password (for training, see [Training accounts](#training-accounts-demo-only)).

If the screen still looks signed in after Sign out, refresh the page once, then sign in again.

### What you see after login

- **Drivers** go to their stop list for the service day, with a progress bar and stop cards.
- **Managers and admins** go to the **Operations** portal with a **left sidebar**:
  - **Workspace:** Dashboard, Routes & Stops, Driver Logs, Invoices, Reports  
  - **Manage:** Customers, Drivers (admin only), NetSuite  
- Use **← Homepage** in the top bar to return to the public site without signing out.

On a phone, open the menu with the **☰** button if the sidebar is hidden.

---

## Requirement 1: Give every driver a clear daily stop list

**Goal:** Each driver knows where to go, in what order, with live status.

### For managers / admins — set up customers & locations

1. Open the portal sidebar → **Customers**.
2. Under **New location**, enter the **Name** and **Address**.
3. Choose **Add location**.

**Edit a location**

1. In the list, choose **Edit**.
2. A **popup** opens with the name and address.
3. Choose **Save location**, or **Cancel** / **Close** / click outside to leave without saving.

**Turn a location off or on**

- Choose **Deactivate** so it stays off new routes (existing history remains).
- Choose **Reactivate** when it should be available again.

**Import many locations at once**

1. Prepare a spreadsheet saved as CSV with columns: `name`, `address` (optional: `active`).
2. On Customers, choose the CSV file under **Import locations**.
3. Read the green notice to confirm how many were added or updated.

### For managers / admins — build a route for a day

1. Open **Routes & Stops**.
2. Set the **Service date** (the day the work happens).
3. Under **Add a stop**:
   - Pick the **driver**.
   - Choose a saved **location**, or type a one-off customer name and address.
   - Enter **pickup** details if needed.
4. Save / add the stop.
5. Repeat until the driver’s day is planned.

**Or import from NetSuite** — see [Requirement 8](#requirement-8-netsuite-dispatch-import--export-managers-and-administrators).

**Import many stops with a simple CSV** (Routes page)

CSV columns: `driverEmail`, `serviceDate`, `customer`, `pickup`  
Optional: `address`, `sequence`

**Adjust a route before work starts**

For stops still **Not started**, you can move them up/down or **Remove** them.  
Once a driver has progressed a stop, treat it as field work in progress.

### Dashboard (office overview)

1. Open **Dashboard**.
2. See stops today, completed count, in-progress count, and items that may need attention.
3. Use **Open routes** or **View all routes** to jump into **Routes & Stops**.

### For drivers — view your day

1. After login you see **Today’s stops**.
2. Confirm the **service date** at the top (change it if you need another day).
3. Read each stop card: customer, address, pickup info, and status chip.
4. Use the progress bar (for example “3 of 8 complete”) to see how the day is going.
5. Use **Review & submit driver log →** when you are ready to close the day on paper.

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

1. Open **Routes & Stops** and pick the service date (or start from **Dashboard**).
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

On **Routes & Stops**, open a stop’s activity to review notes and photos.  
On **Reports**, completed stops can also show this detail for past work.

---

## Requirement 4: Flexible stop order

**Goal:** Drivers (and the office, before work starts) can adjust sequence when the day changes.

### For drivers

On your day list, use **Move up** / **Move down** when you need a different order (for traffic, customer readiness, or office direction).

### For managers / admins

On **Routes & Stops**, reorder or remove stops that are still **Not started**.

---

## Requirement 5: Driver logs for billing

**Goal:** Drivers submit a daily log; the office turns it into an invoice with a clear trail.

### For drivers — fill and submit the log

1. From the day view, choose **Review & submit driver log →** (or open the log for that date).
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

### For managers / admins — review submitted logs

> Driver billing submissions are under **Driver Logs**, not **Reports**.

1. Open **Driver Logs** in the sidebar.
2. Under **Submitted logs**, open a log that is waiting.  
   If the list says nothing is waiting, no driver has submitted a log yet (drafts stay on the driver side until they choose **Submit log**).
3. Enter the payment date:
   - Non-port: **Date Paid**
   - Port: **Payment Date (Friday)**
4. Choose **Complete log** to generate the invoice.
5. Download **Invoice PDF** and/or **Log PDF** as needed.
6. Choose **Send to accounting** when ready (if email is not configured, the system still records the send step and you can download the files).

**Find an older invoice**

1. Open **Invoices** in the sidebar.
2. Enter driver name and service date.
3. Choose **Search**, then download PDFs or **Send to accounting**.

**Correct a mistake after review**

1. Open the log from **Driver Logs**.
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

> This is **route** activity, not driver billing logs. For billing, use **Driver Logs** / **Invoices**.

### For managers / admins

1. Open **Reports** in the sidebar.
2. Optionally filter by **Driver**, **Customer**, and date range (**From** / **To**).
3. Run the report.
4. Review averages between status changes and each completed stop’s detail (including notes/photos when present).
5. Choose **Download CSV** if you need the data in a spreadsheet.

---

## Requirement 7: Manage who can sign in (administrators)

**Goal:** Only the right people have access; passwords can be reset safely.

### Create a driver

1. Open **Drivers** in the sidebar (admins only).
2. Under **New driver**, enter name, email, company name (optional), and a password (at least 8 characters).
3. Choose **Create driver**.  
   Share the email and temporary password with the driver securely.

### Edit a driver

1. Choose **Edit** on the driver row.
2. A **popup** opens — update name, email, or company.
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

## Requirement 8: NetSuite dispatch import / export (managers and administrators)

**Goal:** Bring a NetSuite **Dispatch Truck Report** into driver routes, and export portal stops in the same layout.

### Import from NetSuite

1. In NetSuite, export the **Dispatch Truck Report** for the dates you need (Excel or CSV).
2. In the portal, open **NetSuite**.
3. Under **Import Dispatch Truck Report**, choose the `.xlsx` or `.csv` file.
4. Review the preview and **Assign drivers**:
   - Names that match a portal driver are filled in automatically.
   - For any name that still says it needs assignment, pick the correct portal driver from the dropdown.
5. Choose **Import and assign routes**.
6. Stops are created (or replaced, if that driver already had an unfinished route for that date).
7. Drivers can open that **service date** on their phone to run the route.

**Expected columns** (same idea as the NetSuite report):

Driver, In/Out, N° Dispatch, Run, Stop, Date, Customer, Address, City, Destination, Commodity, Container Type, Container Qty, Action, Dispatch notes, Dispatch type, Priority, Dispatched By

Pickup text in the portal is built from Action, Commodity, container info, and notes when those columns are filled.

Rows missing a driver, date, customer, or address/city are skipped and listed as row errors — fix them in NetSuite or add the stop by hand under **Routes & Stops**.

### Export back to NetSuite layout

1. Still on **NetSuite**, open **Export Dispatch Truck Report**.
2. Choose **From** and **To** service dates.
3. Choose **Download Excel** or **Download CSV**.

### Optional credentials

Credential slots on the NetSuite page are for a future live connection. You do **not** need them for file import/export today.

---

## Quick reference — file imports

| Import | Where | Formats | Required columns / notes |
|--------|-------|---------|---------------------------|
| Customers / locations | Customers | CSV | `name`, `address` (optional: `active`) |
| Drivers | Drivers (admin) | CSV | `name`, `email`, `password` (optional: `companyName`, `active`) |
| Route stops (simple) | Routes & Stops | CSV | `driverEmail`, `serviceDate`, `customer`, `pickup` (optional: `address`, `sequence`) |
| NetSuite dispatch | NetSuite | **Excel or CSV** | Dispatch Truck Report columns; assign drivers after preview |

Tip: For simple CSVs, use one header row with the exact names above, then **Save as CSV**. For NetSuite, keep the report headers as exported.

---

## Everyday checklists

### Driver — start of day

- [ ] Sign in  
- [ ] Confirm the correct service date  
- [ ] Review stop list and any route alerts  
- [ ] Use **Get started** on the first stop  

### Driver — end of day

- [ ] Mark remaining stops complete  
- [ ] Open **Review & submit driver log**  
- [ ] Fill company name and all ticket lines  
- [ ] **Submit log**  

### Manager — plan the day

- [ ] Customers / locations up to date  
- [ ] Routes built (manual, simple CSV, or **NetSuite** dispatch import)  
- [ ] Unmatched NetSuite driver names assigned before import  
- [ ] Confirm **Dashboard** or **Routes & Stops** looks right  

### Manager — close the books

- [ ] Check **Routes & Stops** for unfinished work  
- [ ] Open **Driver Logs** → submitted queue  
- [ ] Enter payment date → **Complete log**  
- [ ] Use **Invoices** to find older invoices / send to accounting  
- [ ] Run **Reports** if leadership needs stop timing summaries  

### Admin — access hygiene

- [ ] Create or import new drivers before their first day  
- [ ] Reset access when someone forgets a password  
- [ ] Deactivate people who leave  
- [ ] Sign out before testing a driver account on a shared computer  

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| Cannot sign in | Recheck email/password; ask admin if the account is inactive |
| Cannot sign out / switch profiles | Use **Sign out**, wait for the login page, then sign in as the other user; refresh once if needed |
| Driver sees no stops | Wrong service date, or office has not assigned a route yet (check NetSuite import assignments) |
| Edit button “does nothing” | Look for the **popup** in the center of the screen (near the bottom on a phone) |
| Cannot find driver submissions | Open **Driver Logs**, not **Reports**. The queue stays empty until a driver chooses **Submit log** |
| Cannot submit log | Fill company name, at least one line, and required ticket/price fields |
| Log will not let me edit | Already submitted — ask the manager to correct it if needed |
| NetSuite import blocked | Assign every unmatched driver name, then import again |
| Some NetSuite rows skipped | Those rows likely lack address/city (or other required fields); fix in the file or add the stop manually |
| Invoice not found | Use **Invoices** search with the same driver spelling and exact service date |
| Sidebar missing on phone | Tap **☰** to open the menu |

---

## Training accounts (demo only)

If your team uses the demo seed data, every demo password is `demo-password`:

| Email | Role |
|-------|------|
| jordan@cws.local | Admin |
| chino@cws.local | Manager |
| alex.rivera@cws.local | Driver (includes a sample September 30 route) |
| sam.thompson@cws.local | Driver |

**Suggested walkthrough:** Sign in as Jordan → **Sign out** → sign in as Alex → submit a log for a service date → **Sign out** → sign in as Chino or Jordan → open **Driver Logs**.

Do not use demo passwords for real production accounts.

---

## Need help?

Start with your office manager for route, NetSuite file, and log questions.  
Ask an administrator for sign-in, password reset, or new driver setup.  
Ask your technical contact for website outages or errors that mention the system could not save or load data.
