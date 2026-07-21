


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."damage_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "rental_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "reported_during" "text" NOT NULL,
    "comparison_slot" "text",
    "damage_type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "description" "text" NOT NULL,
    "reported_by" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "closeup_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "annotation_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "damage_events_damage_type_check" CHECK (("damage_type" = ANY (ARRAY['scratch'::"text", 'dent'::"text", 'crack'::"text", 'broken_part'::"text", 'tire_wheel'::"text", 'glass'::"text", 'other'::"text"]))),
    CONSTRAINT "damage_events_reported_during_check" CHECK (("reported_during" = ANY (ARRAY['checkout'::"text", 'return'::"text"]))),
    CONSTRAINT "damage_events_severity_check" CHECK (("severity" = ANY (ARRAY['minor'::"text", 'moderate'::"text", 'major'::"text"]))),
    CONSTRAINT "damage_events_status_check" CHECK (("status" = ANY (ARRAY['existing'::"text", 'open'::"text", 'needs_review'::"text", 'repaired'::"text", 'charged'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."damage_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."damage_events"."annotation_data" IS 'Normalized image annotation data. Marker and stroke coordinates are stored from 0 to 1.';



CREATE TABLE IF NOT EXISTS "public"."inspections" (
    "id" "uuid" NOT NULL,
    "rental_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "inspection_type" "text" NOT NULL,
    "customer_name" "text" NOT NULL,
    "odometer" "text" NOT NULL,
    "fuel_level" "text" NOT NULL,
    "damage_notes" "text" NOT NULL,
    "photo_paths" "jsonb" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "damage_assessment" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "return_checklist" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "inspections_inspection_type_check" CHECK (("inspection_type" = ANY (ARRAY['checkout'::"text", 'return'::"text"])))
);


ALTER TABLE "public"."inspections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rentals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "customer_name" "text",
    "access_code" "text",
    "status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_last_name" "text",
    CONSTRAINT "rentals_status_check" CHECK (("status" = ANY (ARRAY['ready'::"text", 'active'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."rentals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "unit_number" "text" NOT NULL,
    "qr_token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(16), 'hex'::"text") NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."damage_events"
    ADD CONSTRAINT "damage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rentals"
    ADD CONSTRAINT "rentals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_qr_token_key" UNIQUE ("qr_token");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_unit_number_key" UNIQUE ("unit_number");



CREATE INDEX "damage_events_rental_idx" ON "public"."damage_events" USING "btree" ("rental_id");



CREATE INDEX "damage_events_vehicle_created_idx" ON "public"."damage_events" USING "btree" ("vehicle_id", "created_at" DESC);



CREATE UNIQUE INDEX "inspections_one_type_per_rental_idx" ON "public"."inspections" USING "btree" ("rental_id", "inspection_type");



CREATE UNIQUE INDEX "rentals_active_access_code_idx" ON "public"."rentals" USING "btree" ("access_code") WHERE ("status" = ANY (ARRAY['ready'::"text", 'active'::"text"]));



CREATE INDEX "rentals_vehicle_last_name_status_idx" ON "public"."rentals" USING "btree" ("vehicle_id", "lower"("customer_last_name"), "status");



ALTER TABLE ONLY "public"."damage_events"
    ADD CONSTRAINT "damage_events_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."damage_events"
    ADD CONSTRAINT "damage_events_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."damage_events"
    ADD CONSTRAINT "damage_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id");



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."rentals"
    ADD CONSTRAINT "rentals_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE "public"."damage_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rentals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."damage_events" TO "anon";
GRANT ALL ON TABLE "public"."damage_events" TO "authenticated";
GRANT ALL ON TABLE "public"."damage_events" TO "service_role";



GRANT ALL ON TABLE "public"."inspections" TO "anon";
GRANT ALL ON TABLE "public"."inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."inspections" TO "service_role";



GRANT ALL ON TABLE "public"."rentals" TO "anon";
GRANT ALL ON TABLE "public"."rentals" TO "authenticated";
GRANT ALL ON TABLE "public"."rentals" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







