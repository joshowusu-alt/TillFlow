-- Run with a read-only PostgreSQL role. Effective overrides are intentional
-- and are shown for review without being considered purchased-plan mismatches.
BEGIN READ ONLY;

SELECT b.id, b.name, b.plan, b."selectedPlan", s."purchasedPlan", s."effectivePlanOverride"
FROM "Business" b
LEFT JOIN "ControlBusinessProfile" p ON p."businessId" = b.id
LEFT JOIN "ControlSubscription" s ON s."controlBusinessId" = p.id
WHERE b.plan IS DISTINCT FROM b."selectedPlan"
   OR (s.id IS NOT NULL AND s."purchasedPlan" IS DISTINCT FROM b.plan)
ORDER BY b.name, b.id;

COMMIT;
