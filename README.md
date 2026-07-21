# MORA Inspection MVP

A bare-minimum, mobile-first Next.js + Supabase app for customer vehicle checkout and return inspections.

## Included
- Permanent vehicle QR URL
- Short rental access code
- Checkout and return modes
- Five required camera photos
- Odometer/hours, fuel and damage notes
- Private Supabase Storage bucket
- Minimal password-protected inspection list

## Intentionally excluded
- Video uploads
- Digital signature drawing
- PDF reports
- Email/text notifications
- Booking integration
- Customer accounts
- Automated damage detection

## Setup

### 1. Create a Supabase project
Create a new project at Supabase and wait for it to finish provisioning.

### 2. Open the Supabase SQL Editor
In your Supabase project, select **SQL Editor** and then **New query**.

### 3. Run the database setup SQL
On your computer, open the file:

`supabase/schema.sql`

Copy **all of the SQL statements inside that file**. Paste those statements into the Supabase SQL Editor and click **Run**.

Do not paste the filename `supabase/schema.sql` into the SQL Editor. The editor only accepts SQL statements.

After it runs, the results should include a test vehicle's `unit_number` and `qr_token`.

### 4. Create the environment file
Copy `.env.example` and rename the copy to `.env.local`.

Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
ADMIN_PASSWORD=choose-a-strong-password
```

Get the project URL and service-role key from Supabase under **Project Settings > API**. Never expose the service-role key publicly.

### 5. Install and run the app
From the project folder, run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### 6. Test the customer inspection
If you did not save the token from Step 3, run this in Supabase SQL Editor:

```sql
select unit_number, qr_token from public.vehicles;
```

Open:

`http://localhost:3000/vehicle/YOUR_QR_TOKEN`

Use test rental access code:

`1234`

### 7. View submitted inspections
Open:

`http://localhost:3000/admin`

Enter the `ADMIN_PASSWORD` from `.env.local`.

## Add a real vehicle and rental

```sql
insert into public.vehicles (name, unit_number)
values ('2025 Can-Am Maverick X3', 'M3');

insert into public.rentals (vehicle_id, customer_name, access_code)
select id, 'Jane Customer', '8421'
from public.vehicles
where unit_number = 'M3';
```

Then retrieve that vehicle's permanent QR token:

```sql
select unit_number, qr_token
from public.vehicles
where unit_number = 'M3';
```

Generate a QR code pointing to:

`https://YOUR-DOMAIN.com/vehicle/VEHICLE_QR_TOKEN`

## Important production notes
- Rotate the service-role key immediately if it is ever exposed.
- Do not prefix the service-role key with `NEXT_PUBLIC_`.
- Add rate limiting and CAPTCHA before public launch.
- Add image resizing/compression before scaling usage.
- Replace the simple admin password with Supabase Auth before adding employees.
- Add a cleanup job or retention policy for old photos.

## Return inspection and photo comparison
The customer uses the same permanent vehicle QR page and selects **Return**. They enter the same rental access code and submit the same five photo angles.

The admin dashboard groups checkout and return inspections by rental. Click **View inspection** to see matching checkout and return photos side by side. The image links are temporary signed URLs and expire after 30 minutes.

For existing Supabase projects, run the contents of:

`supabase/return-comparison-upgrade.sql`

This adds a database safeguard that permits only one checkout and one return inspection per rental.

## Last-name lookup upgrade

The customer form now identifies a rental using:

- the QR code's vehicle
- the renter's last name
- the rental status (`ready` for checkout or `active` for return)

For an existing Supabase project, run the contents of:

```text
supabase/last-name-lookup-upgrade.sql
```

The existing sample renter is **Test Customer**, so enter this last name during testing:

```text
Customer
```

When creating future rentals, populate both `customer_name` and `customer_last_name`. The last-name value should contain only the renter's last name.

## Checkout-name testing update

For existing Supabase projects, run `supabase/checkout-name-optional-photos-upgrade.sql` once.

- Checkout finds the single `ready` rental assigned to the scanned vehicle.
- The renter enters a last name during checkout; that value is then stored in `rentals.customer_last_name`.
- Return finds the `active` rental using the scanned vehicle and the saved checkout last name.
- Photos are optional while testing. Any photos that are supplied are still uploaded and shown in the admin comparison view.

## Automatic readiness after return

After a return inspection is submitted, the completed rental remains in the database for history and the app automatically creates a new blank `ready` rental for the same vehicle. The next customer can immediately begin a new checkout without a manual database reset.

## Fleet and date-organized photo folders

Run `supabase/fleet-and-date-folders-upgrade.sql` once in Supabase SQL Editor. It adds:

- War Pig
- Big Booty Judy
- Blackie
- R1, R2, R3, R4
- Batmobile
- Defender #1, Defender #2, Defender #3

It also creates one blank `ready` rental for each vehicle and returns each permanent QR token.

New uploaded photos are stored in the private `inspection-photos` bucket using this structure:

```text
YYYY/MM/DD/vehicle-name/checkout/rental-id/inspection-id/front.jpg
YYYY/MM/DD/vehicle-name/return/rental-id/inspection-id/front.jpg
```

Dates use the `America/Denver` timezone. Supabase Storage folders are virtual, so a vehicle folder appears after at least one photo is uploaded for that vehicle on that date. The admin dashboard remains organized by date and vehicle and keeps checkout and return photos side by side.

## Employee selection vehicles

For Batmobile, Big Booty Judy, Blackie, Defender #1, Defender #2, Defender #3, and War Pig, the inspection form shows employee-name buttons instead of first-name and last-name fields. The checkout and return inspections may be completed by different employees. The selected employee is saved on each inspection and shown in the admin dashboard.

## Fleet dashboard update

The admin page now opens to a live fleet dashboard after password entry. It shows every active vehicle as Ready, Out, or Needs attention. Vehicles that are out display the person who checked them out, the checkout time, and a button to open the active side-by-side inspection. The dated inspection archive remains below the live dashboard.

No Supabase SQL update is required for this dashboard update.
