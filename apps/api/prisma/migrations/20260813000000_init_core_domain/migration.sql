-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('CUSTOMER', 'BUSINESS_USER', 'PLATFORM_USER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'PENDING', 'DELETED');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('PASSWORD', 'OTP_PHONE', 'OTP_EMAIL', 'OAUTH');

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'REGISTER', 'RESET', 'VERIFY_PHONE');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('PLATFORM', 'BUSINESS', 'BRANCH');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BusinessDocumentType" AS ENUM ('GST', 'LICENSE', 'ID_PROOF', 'ADDRESS_PROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TEMP_CLOSED');

-- CreateEnum
CREATE TYPE "InventoryMode" AS ENUM ('AVAILABILITY_ONLY', 'LOW_STOCK_THRESHOLD', 'TRACKED_QUANTITY');

-- CreateEnum
CREATE TYPE "BranchStaffStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('KG', 'G', 'L', 'ML', 'PIECE', 'PACK', 'PAGE', 'SERVICE');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PERCENT', 'FLAT');

-- CreateEnum
CREATE TYPE "ProductAvailability" AS ENUM ('AVAILABLE', 'OUT_OF_STOCK', 'HIDDEN');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('MANUAL_ADJUST', 'RESERVE', 'RELEASE', 'CONSUME', 'IMPORT', 'CORRECTION');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CART', 'ORDER_PLACED', 'RECEIVED', 'ACCEPTED', 'PREPARING', 'PACKING', 'PACKED', 'READY_FOR_PICKUP', 'CUSTOMER_ARRIVED', 'HANDED_OVER', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'PAYMENT_FAILED', 'REFUND_PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FulfilmentType" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('PAY_AT_STORE', 'ONLINE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUND_PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('CUSTOMER', 'BUSINESS', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PackingStatus" AS ENUM ('PENDING', 'PACKED', 'SUBSTITUTED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "PickupMethod" AS ENUM ('CODE', 'QR', 'OTP', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('ORDER', 'BRANCH', 'SUPPORT');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'SYSTEM_ONLY', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'SYSTEM', 'PRODUCT_REF', 'ORDER_REF', 'QUOTE');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('CHAT_IMAGE', 'CHAT_DOCUMENT', 'PRODUCT_IMAGE', 'BUSINESS_DOCUMENT', 'BUSINESS_MEDIA', 'AVATAR', 'REVIEW_PHOTO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'UPLOADED', 'SCANNING', 'SCAN_CLEAN', 'INFECTED', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('ORDER', 'CHAT', 'ACCOUNT', 'PAYMENT', 'MARKETING', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('CRITICAL', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SUPPRESSED');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "user_type" "UserType" NOT NULL,
    "full_name" TEXT,
    "phone_e164" TEXT,
    "phone_verified_at" TIMESTAMPTZ(6),
    "email" CITEXT,
    "email_verified_at" TIMESTAMPTZ(6),
    "avatar_media_id" UUID,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_credential" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "CredentialType" NOT NULL,
    "provider" TEXT,
    "provider_subject" TEXT,
    "secret_hash" TEXT,
    "password_changed_at" TIMESTAMPTZ(6),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenge" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "destination" TEXT NOT NULL,
    "channel" "OtpChannel" NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "ip" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "otp_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "push_token" TEXT,
    "push_token_invalid_at" TIMESTAMPTZ(6),
    "app_version" TEXT,
    "os_version" TEXT,
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID,
    "refresh_token_hash" TEXT NOT NULL,
    "parent_session_id" UUID,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" TEXT,
    "ip" INET,
    "user_agent" TEXT,
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope_type" "RoleScope" NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "business_id" UUID,
    "branch_id" UUID,
    "granted_by" UUID,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_category" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon_media_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "business_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "business_category_id" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legal_name" TEXT,
    "description" TEXT,
    "logo_media_id" UUID,
    "cover_media_id" UUID,
    "status" "BusinessStatus" NOT NULL DEFAULT 'DRAFT',
    "status_reason" TEXT,
    "approved_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "plan_code" TEXT NOT NULL DEFAULT 'FREE',
    "rating_avg" DECIMAL(3,2),
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "reliability_score" DECIMAL(5,2),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_document" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "doc_type" "BusinessDocumentType" NOT NULL,
    "media_id" UUID,
    "number_encrypted" BYTEA,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "business_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "phone_e164" TEXT,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "postal_code" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "location" geography(Point, 4326) NOT NULL,
    "pickup_instructions" TEXT,
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "accepting_orders" BOOLEAN NOT NULL DEFAULT true,
    "avg_prep_minutes" INTEGER,
    "inventory_mode" "InventoryMode" NOT NULL DEFAULT 'AVAILABILITY_ONLY',
    "order_accept_timeout_min" INTEGER,
    "pickup_expiry_hours" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_hour" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "opens_at" TIME(6) NOT NULL,
    "closes_at" TIME(6) NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "branch_hour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_holiday" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "is_closed" BOOLEAN NOT NULL DEFAULT true,
    "opens_at" TIME(6),
    "closes_at" TIME(6),

    CONSTRAINT "branch_holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_staff" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "status" "BranchStaffStatus" NOT NULL DEFAULT 'INVITED',
    "invited_by" UUID,
    "joined_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_category" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "icon_media_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_category_custom" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "business_category_custom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_product" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "barcode" TEXT,
    "product_category_id" UUID,
    "unit" "ProductUnit" NOT NULL,
    "unit_value" DECIMAL(12,3) NOT NULL,
    "default_mrp" DECIMAL(12,2),
    "image_media_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "master_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "product_category_id" UUID,
    "business_category_custom_id" UUID,
    "master_product_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "brand" TEXT,
    "sku" TEXT,
    "unit" "ProductUnit" NOT NULL,
    "unit_value" DECIMAL(12,3) NOT NULL,
    "mrp" DECIMAL(12,2),
    "base_price" DECIMAL(12,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discount_type" "DiscountType" NOT NULL DEFAULT 'NONE',
    "discount_value" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    -- Generated rather than trigger-maintained: the index can never fall out
    -- of sync with the row it describes.
    "search_vector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
        setweight(to_tsvector('simple', coalesce("brand", '')), 'B') ||
        setweight(to_tsvector('simple', coalesce("description", '')), 'C')
    ) STORED,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_media" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_product" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "price_override" DECIMAL(12,2),
    "availability" "ProductAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "quantity_on_hand" DECIMAL(12,3),
    "quantity_reserved" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "low_stock_threshold" DECIMAL(12,3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transaction" (
    "id" UUID NOT NULL,
    "branch_product_id" UUID NOT NULL,
    "order_id" UUID,
    "type" "InventoryTransactionType" NOT NULL,
    "quantity_delta" DECIMAL(12,3) NOT NULL,
    "quantity_after" DECIMAL(12,3),
    "reason" TEXT,
    "actor_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "address" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" TEXT,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "landmark" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "postal_code" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "location" geography(Point, 4326),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart" (
    "id" UUID NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(6),
    "converted_order_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "branch_product_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_price_snapshot" DECIMAL(12,2) NOT NULL,
    "tax_rate_snapshot" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cart_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "cart_id" UUID,
    "status" "OrderStatus" NOT NULL DEFAULT 'ORDER_PLACED',
    "fulfilment_type" "FulfilmentType" NOT NULL DEFAULT 'PICKUP',
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "payment_mode" "PaymentMode" NOT NULL DEFAULT 'PAY_AT_STORE',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "prep_minutes_initial" INTEGER,
    "prep_minutes_current" INTEGER,
    "placed_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6),
    "accepted_at" TIMESTAMPTZ(6),
    "promised_ready_at" TIMESTAMPTZ(6),
    "ready_at" TIMESTAMPTZ(6),
    "arrived_at" TIMESTAMPTZ(6),
    "handed_over_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_user_id" UUID,
    "cancel_reason" TEXT,
    "pickup_code" CHAR(6),
    "customer_note" TEXT,
    "idempotency_key" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID,
    "branch_product_id" UUID,
    "name_snapshot" TEXT NOT NULL,
    "unit_snapshot" "ProductUnit" NOT NULL,
    "unit_value_snapshot" DECIMAL(12,3) NOT NULL,
    "quantity_ordered" DECIMAL(12,3) NOT NULL,
    "quantity_fulfilled" DECIMAL(12,3),
    "unit_price" DECIMAL(12,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(12,2) NOT NULL,
    "packing_status" "PackingStatus" NOT NULL DEFAULT 'PENDING',
    "substitute_product_id" UUID,
    "substitution_approved_at" TIMESTAMPTZ(6),
    "is_custom_item" BOOLEAN NOT NULL DEFAULT false,
    "custom_spec" JSONB,
    "media_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "actor_user_id" UUID,
    "actor_role" TEXT,
    "actor_type" "ActorType" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_prep_adjustment" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "delta_minutes" INTEGER NOT NULL,
    "reason" TEXT,
    "actor_user_id" UUID,
    "promised_ready_at_before" TIMESTAMPTZ(6),
    "promised_ready_at_after" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_prep_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "method" "PickupMethod" NOT NULL DEFAULT 'CODE',
    "verified_at" TIMESTAMPTZ(6),
    "verified_by_user_id" UUID,
    "override_reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pickup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation" (
    "id" UUID NOT NULL,
    "type" "ConversationType" NOT NULL,
    "order_id" UUID,
    "business_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "last_message_id" UUID,
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_member" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "member_role" "ActorType" NOT NULL,
    "last_read_message_id" UUID,
    "last_read_at" TIMESTAMPTZ(6),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "muted_until" TIMESTAMPTZ(6),
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "conversation_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_user_id" UUID,
    "client_message_id" TEXT,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "body" TEXT,
    "payload" JSONB,
    "reply_to_message_id" UUID,
    "status" "MessageStatus" NOT NULL DEFAULT 'SENT',
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachment" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "message_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_object" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID,
    "purpose" "MediaPurpose" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT,
    "checksum_sha256" TEXT,
    "original_filename" TEXT,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "scan_result" JSONB,
    "width" INTEGER,
    "height" INTEGER,
    "page_count" INTEGER,
    "thumbnail_key" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "media_object_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "event_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "payload" JSONB,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "provider_message_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preference" (
    "user_id" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "quiet_hours_start" TIME(6),
    "quiet_hours_end" TIME(6),

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("user_id","category","channel")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_event" (
    "handler" TEXT NOT NULL,
    "event_id" UUID NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_event_pkey" PRIMARY KEY ("handler","event_id")
);

-- CreateTable
CREATE TABLE "idempotency_record" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "user_id" UUID,
    "endpoint" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_type" "ActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "ip" INET,
    "user_agent" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_config" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "targeting" JSONB NOT NULL DEFAULT '{}',
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "city" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "is_launched" BOOLEAN NOT NULL DEFAULT false,
    "launched_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "city_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_e164_key" ON "user"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_user_type_status_idx" ON "user"("user_type", "status");

-- CreateIndex
CREATE INDEX "user_created_at_idx" ON "user"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_credential_user_id_type_provider_key" ON "user_credential"("user_id", "type", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "user_credential_provider_provider_subject_key" ON "user_credential"("provider", "provider_subject");

-- CreateIndex
CREATE INDEX "otp_challenge_destination_purpose_created_at_idx" ON "otp_challenge"("destination", "purpose", "created_at" DESC);

-- CreateIndex
CREATE INDEX "otp_challenge_expires_at_idx" ON "otp_challenge"("expires_at");

-- CreateIndex
CREATE INDEX "device_push_token_idx" ON "device"("push_token");

-- CreateIndex
CREATE UNIQUE INDEX "device_user_id_platform_push_token_key" ON "device"("user_id", "platform", "push_token");

-- CreateIndex
CREATE UNIQUE INDEX "session_refresh_token_hash_key" ON "session"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "session_user_id_revoked_at_idx" ON "session"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "session_family_id_idx" ON "session"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_code_key" ON "role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permission_code_key" ON "permission"("code");

-- CreateIndex
CREATE INDEX "role_permission_permission_id_idx" ON "role_permission"("permission_id");

-- CreateIndex
CREATE INDEX "user_role_user_id_idx" ON "user_role"("user_id");

-- CreateIndex
CREATE INDEX "user_role_business_id_idx" ON "user_role"("business_id");

-- CreateIndex
CREATE INDEX "user_role_branch_id_idx" ON "user_role"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_user_id_role_id_business_id_branch_id_key" ON "user_role"("user_id", "role_id", "business_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_category_code_key" ON "business_category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "business_slug_key" ON "business"("slug");

-- CreateIndex
CREATE INDEX "business_status_idx" ON "business"("status");

-- CreateIndex
CREATE INDEX "business_business_category_id_status_idx" ON "business"("business_category_id", "status");

-- CreateIndex
CREATE INDEX "business_owner_user_id_idx" ON "business"("owner_user_id");

-- CreateIndex
CREATE INDEX "business_document_business_id_status_idx" ON "business_document"("business_id", "status");

-- CreateIndex
CREATE INDEX "branch_business_id_status_idx" ON "branch"("business_id", "status");

-- CreateIndex
CREATE INDEX "branch_city_status_idx" ON "branch"("city", "status");

-- CreateIndex
CREATE INDEX "branch_location_gist" ON "branch" USING GIST ("location" gist_geography_ops);

-- CreateIndex
CREATE UNIQUE INDEX "branch_business_id_code_key" ON "branch"("business_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "branch_hour_branch_id_day_of_week_opens_at_key" ON "branch_hour"("branch_id", "day_of_week", "opens_at");

-- CreateIndex
CREATE UNIQUE INDEX "branch_holiday_branch_id_date_key" ON "branch_holiday"("branch_id", "date");

-- CreateIndex
CREATE INDEX "branch_staff_user_id_idx" ON "branch_staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_staff_branch_id_user_id_key" ON "branch_staff"("branch_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_category_slug_key" ON "product_category"("slug");

-- CreateIndex
CREATE INDEX "product_category_parent_id_idx" ON "product_category"("parent_id");

-- CreateIndex
CREATE INDEX "product_category_path_idx" ON "product_category"("path");

-- CreateIndex
CREATE UNIQUE INDEX "business_category_custom_business_id_name_key" ON "business_category_custom"("business_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "master_product_barcode_key" ON "master_product"("barcode");

-- CreateIndex
CREATE INDEX "master_product_product_category_id_is_active_idx" ON "master_product"("product_category_id", "is_active");

-- CreateIndex
CREATE INDEX "product_business_id_is_active_idx" ON "product"("business_id", "is_active");

-- CreateIndex
CREATE INDEX "product_product_category_id_idx" ON "product"("product_category_id");

-- CreateIndex
CREATE INDEX "product_search_vector_gin" ON "product" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "product_name_trgm" ON "product" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "product_business_id_sku_key" ON "product"("business_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_media_product_id_media_id_key" ON "product_media"("product_id", "media_id");

-- CreateIndex
CREATE INDEX "branch_product_branch_id_availability_idx" ON "branch_product"("branch_id", "availability");

-- CreateIndex
CREATE INDEX "branch_product_product_id_idx" ON "branch_product"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_product_branch_id_product_id_key" ON "branch_product"("branch_id", "product_id");

-- CreateIndex
CREATE INDEX "inventory_transaction_branch_product_id_created_at_idx" ON "inventory_transaction"("branch_product_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_transaction_order_id_idx" ON "inventory_transaction"("order_id");

-- CreateIndex
CREATE INDEX "address_user_id_is_default_idx" ON "address"("user_id", "is_default");

-- CreateIndex
CREATE INDEX "address_location_gist" ON "address" USING GIST ("location" gist_geography_ops);

-- CreateIndex
CREATE UNIQUE INDEX "cart_converted_order_id_key" ON "cart"("converted_order_id");

-- CreateIndex
CREATE INDEX "cart_customer_user_id_status_idx" ON "cart"("customer_user_id", "status");

-- CreateIndex
CREATE INDEX "cart_branch_id_status_idx" ON "cart"("branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cart_item_cart_id_branch_product_id_key" ON "cart_item"("cart_id", "branch_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_order_number_key" ON "order"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "order_cart_id_key" ON "order"("cart_id");

-- CreateIndex
CREATE INDEX "order_branch_id_status_placed_at_idx" ON "order"("branch_id", "status", "placed_at" DESC);

-- CreateIndex
CREATE INDEX "order_customer_user_id_placed_at_idx" ON "order"("customer_user_id", "placed_at" DESC);

-- CreateIndex
CREATE INDEX "order_status_placed_at_idx" ON "order"("status", "placed_at");

-- CreateIndex
CREATE INDEX "order_business_id_completed_at_idx" ON "order"("business_id", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_customer_user_id_idempotency_key_key" ON "order"("customer_user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "order_item_order_id_idx" ON "order_item"("order_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "order_prep_adjustment_order_id_created_at_idx" ON "order_prep_adjustment"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_order_id_key" ON "pickup"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_order_id_key" ON "conversation"("order_id");

-- CreateIndex
CREATE INDEX "conversation_branch_id_last_message_at_idx" ON "conversation"("branch_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "conversation_customer_user_id_last_message_at_idx" ON "conversation"("customer_user_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "conversation_member_user_id_idx" ON "conversation_member"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_member_conversation_id_user_id_key" ON "conversation_member"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "message_conversation_id_created_at_idx" ON "message"("conversation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "message_sender_user_id_idx" ON "message"("sender_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_conversation_id_client_message_id_key" ON "message"("conversation_id", "client_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_attachment_message_id_media_id_key" ON "message_attachment"("message_id", "media_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_object_storage_key_key" ON "media_object"("storage_key");

-- CreateIndex
CREATE INDEX "media_object_owner_user_id_created_at_idx" ON "media_object"("owner_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "media_object_status_idx" ON "media_object"("status");

-- CreateIndex
CREATE INDEX "notification_user_id_created_at_idx" ON "notification"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_delivery_dedupe_key_key" ON "notification_delivery"("dedupe_key");

-- CreateIndex
CREATE INDEX "notification_delivery_notification_id_idx" ON "notification_delivery"("notification_id");

-- CreateIndex
CREATE INDEX "outbox_event_published_at_occurred_at_idx" ON "outbox_event"("published_at", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_event_aggregate_type_aggregate_id_idx" ON "outbox_event"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "idempotency_record_expires_at_idx" ON "idempotency_record"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_record_user_id_endpoint_key_key" ON "idempotency_record"("user_id", "endpoint", "key");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_created_at_idx" ON "audit_log"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_created_at_idx" ON "audit_log"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "city_name_state_country_key" ON "city"("name", "state", "country");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_avatar_media_id_fkey" FOREIGN KEY ("avatar_media_id") REFERENCES "media_object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_credential" ADD CONSTRAINT "user_credential_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenge" ADD CONSTRAINT "otp_challenge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business" ADD CONSTRAINT "business_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business" ADD CONSTRAINT "business_business_category_id_fkey" FOREIGN KEY ("business_category_id") REFERENCES "business_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_document" ADD CONSTRAINT "business_document_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_document" ADD CONSTRAINT "business_document_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch" ADD CONSTRAINT "branch_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_hour" ADD CONSTRAINT "branch_hour_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_holiday" ADD CONSTRAINT "branch_holiday_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_staff" ADD CONSTRAINT "branch_staff_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_staff" ADD CONSTRAINT "branch_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_staff" ADD CONSTRAINT "branch_staff_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_category_custom" ADD CONSTRAINT "business_category_custom_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_product" ADD CONSTRAINT "master_product_product_category_id_fkey" FOREIGN KEY ("product_category_id") REFERENCES "product_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_product_category_id_fkey" FOREIGN KEY ("product_category_id") REFERENCES "product_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_business_category_custom_id_fkey" FOREIGN KEY ("business_category_custom_id") REFERENCES "business_category_custom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_master_product_id_fkey" FOREIGN KEY ("master_product_id") REFERENCES "master_product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_object"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_product" ADD CONSTRAINT "branch_product_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_product" ADD CONSTRAINT "branch_product_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_branch_product_id_fkey" FOREIGN KEY ("branch_product_id") REFERENCES "branch_product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address" ADD CONSTRAINT "address_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart" ADD CONSTRAINT "cart_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart" ADD CONSTRAINT "cart_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_branch_product_id_fkey" FOREIGN KEY ("branch_product_id") REFERENCES "branch_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "cart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_branch_product_id_fkey" FOREIGN KEY ("branch_product_id") REFERENCES "branch_product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_prep_adjustment" ADD CONSTRAINT "order_prep_adjustment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup" ADD CONSTRAINT "pickup_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_member" ADD CONSTRAINT "conversation_member_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_member" ADD CONSTRAINT "conversation_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_object"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_object" ADD CONSTRAINT "media_object_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Objects Prisma's schema language cannot express. Everything below is part of
-- the contract the application relies on, not an optimisation:

-- FR-G1: at most one active cart per (customer, branch). Enforced here so a
-- concurrent "add to cart" from two devices cannot create two carts.
CREATE UNIQUE INDEX "cart_one_active_per_customer_branch"
    ON "cart" ("customer_user_id", "branch_id")
    WHERE "status" = 'ACTIVE';

-- Unread badge counts must not scan a user's whole notification history.
CREATE INDEX "notification_unread" ON "notification" ("user_id")
    WHERE "read_at" IS NULL;

-- The outbox pump only ever reads unpublished rows, oldest first.
CREATE INDEX "outbox_event_unpublished" ON "outbox_event" ("occurred_at")
    WHERE "published_at" IS NULL;

-- Soft-deleted rows are excluded from every listing query; keep the hot paths
-- off the tombstones.
CREATE INDEX "product_business_active_live" ON "product" ("business_id", "is_active")
    WHERE "deleted_at" IS NULL;
CREATE INDEX "branch_business_status_live" ON "branch" ("business_id", "status")
    WHERE "deleted_at" IS NULL;

-- Money and quantities: reject impossible values at the storage layer, because
-- a negative price that reaches an invoice is unrecoverable.
ALTER TABLE "product" ADD CONSTRAINT "product_base_price_nonneg" CHECK ("base_price" >= 0);
ALTER TABLE "product" ADD CONSTRAINT "product_tax_rate_range" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100);
ALTER TABLE "branch_product" ADD CONSTRAINT "branch_product_qty_nonneg"
    CHECK (("quantity_on_hand" IS NULL OR "quantity_on_hand" >= 0) AND "quantity_reserved" >= 0);
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_quantity_positive" CHECK ("quantity_ordered" > 0);
ALTER TABLE "order" ADD CONSTRAINT "order_totals_nonneg"
    CHECK ("subtotal" >= 0 AND "tax_total" >= 0 AND "discount_total" >= 0 AND "grand_total" >= 0);

-- An identity with neither phone nor email cannot be authenticated (§29).
ALTER TABLE "user" ADD CONSTRAINT "user_has_contact"
    CHECK ("phone_e164" IS NOT NULL OR "email" IS NOT NULL);

ALTER TABLE "branch_hour" ADD CONSTRAINT "branch_hour_day_range"
    CHECK ("day_of_week" BETWEEN 0 AND 6);

-- Human-readable order numbers (`QP-10025`) come from a sequence, so two
-- concurrent placements cannot collide.
CREATE SEQUENCE "order_number_seq" START 10000;
