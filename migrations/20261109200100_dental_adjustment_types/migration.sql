-- Practice adjustment types (reference data, not patient data). Thresholds are minor units (cents).
INSERT INTO "AdjustmentType" ("id","code","name","direction","category","approvalThresholdMinor","requiresApproval","isActive","updatedAt") VALUES
 ('seed_adjtype_courtesy','COURTESY','Courtesy discount','credit','courtesy',5000,false,true,CURRENT_TIMESTAMP),
 ('seed_adjtype_professional','PROFESSIONAL','Professional courtesy','credit','professional',2500,false,true,CURRENT_TIMESTAMP),
 ('seed_adjtype_small','SMALL-BAL','Small balance write-off','credit','small_balance',1000,false,true,CURRENT_TIMESTAMP),
 ('seed_adjtype_baddebt','BAD-DEBT','Bad debt write-off','credit','bad_debt',0,true,true,CURRENT_TIMESTAMP),
 ('seed_adjtype_broken','BROKEN-FEE','Missed appointment fee','debit','broken_appt_fee',5000,false,true,CURRENT_TIMESTAMP),
 ('seed_adjtype_member','MEMBER-DISC','Membership discount','credit','membership_discount',10000,false,true,CURRENT_TIMESTAMP),
 ('seed_adjtype_other','OTHER-CR','Other credit','credit','other',2500,false,true,CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
