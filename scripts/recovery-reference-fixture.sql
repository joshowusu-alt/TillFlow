CREATE TABLE "Product" (id text, name text, "imageUrl" text);
CREATE TABLE "Category" (id text,"imageUrl" text);
CREATE TABLE "OnlineOrderLine" (id text,"imageUrl" text);
CREATE TABLE "Business" (id text,"receiptLogoUrl" text,"storefrontLogoUrl" text,"logoUrl" text,"brandCompactLogoUrl" text,"brandSquareLogoUrl" text);
CREATE TABLE "Expense" (id text,"attachmentPath" text);
CREATE TABLE "CashVarianceInvestigation" (id text,"evidencePath" text);
CREATE TABLE "ControlSupportIssue" (id text,"attachmentUrl" text);
INSERT INTO "Product" VALUES('p1',E'Fictional café\trow','https://mk8jj77w2uohrpv1.public.blob.vercel-storage.com/fictional.png'),('p2','Null image',NULL);
INSERT INTO "OnlineOrderLine" VALUES('o1','https://www.nestle-cwa.com/fictional');
INSERT INTO "Business" VALUES('b1',NULL,NULL,'data:image/png;base64,AA==',NULL,NULL);

-- Approximately 20MB of synthetic text, compressed to a production-sized archive.
INSERT INTO "Product" SELECT 'filler-'||i, (SELECT string_agg(md5(i::text||'/'||j::text),'') FROM generate_series(1,400) j), NULL FROM generate_series(1,1500) i;
