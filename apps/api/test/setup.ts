process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://x:x@localhost:5432/x";
process.env.JWT_SECRET ??= "test-secret-test-secret";
process.env.GOOGLE_CLIENT_ID ??= "id";
process.env.GOOGLE_CLIENT_SECRET ??= "secret";
process.env.GOOGLE_CALLBACK_URL ??= "http://localhost:5000/cb";
process.env.ENCRYPTION_KEY ??= "a".repeat(64);
process.env.MIN_DELAY_BETWEEN_EMAILS_MS = "0";
