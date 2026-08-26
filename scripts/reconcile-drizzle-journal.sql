-- Reconcile __drizzle_migrations with the migrations that are actually applied.
--
-- WHY THIS EXISTS
--
-- The database holds the effects of every migration in drizzle/, but
-- __drizzle_migrations records only the first one (0000_aberrant_wonder_man).
-- The other 25 were applied by some other route and never journalled.
--
-- The consequence: `drizzle-kit migrate` - and therefore `pnpm db:push` -
-- believes 0001 through 0025 are outstanding and tries to replay them over
-- tables that already exist. Every schema change has had to be applied by hand
-- because of it.
--
-- This backfills the missing rows so the journal matches reality. It creates no
-- tables and alters no columns; it only records what is already true.
--
-- SAFETY
--
-- Each INSERT is guarded by NOT EXISTS on the hash, so running this twice is
-- harmless and it will not disturb the 0000 row that is already present.
--
-- BEFORE RUNNING, confirm the migrations really are applied. These spot checks
-- were verified on 2026-08-26 and should all return a row:
--
--   SELECT 1 FROM information_schema.TABLES  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='action_limits';            -- 0016
--   SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='app_account_id';  -- 0020
--   SELECT 1 FROM information_schema.TABLES  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='account_relationships';    -- 0022
--   SELECT 1 FROM information_schema.TABLES  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='slack_account_bindings';   -- 0024
--   SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='interactions' AND COLUMN_NAME='gate_trace'; -- 0025
--
-- If any of them returns nothing, STOP: that migration is genuinely outstanding
-- and must be applied rather than marked as done.
--
-- AFTERWARDS
--
--   SELECT COUNT(*) FROM __drizzle_migrations;   -- expect 26
--
-- `pnpm db:push` should then be a no-op, and future migrations apply normally.

-- 0000_aberrant_wonder_man
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '814a08e40d7fc2bcfd458759d18319198ca8ae394f2fa15617a78678e9c9c93b', 1787192372010
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '814a08e40d7fc2bcfd458759d18319198ca8ae394f2fa15617a78678e9c9c93b');

-- 0001_jittery_blur
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '199e3303b95d07dfcb9b20a855233f40f66f6520b3d0392ec4862d2dafc0a54f', 1787192738326
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '199e3303b95d07dfcb9b20a855233f40f66f6520b3d0392ec4862d2dafc0a54f');

-- 0002_fuzzy_colossus
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '67bd5417898f8098782cfc90ee61cb1a6a8d89275ef9fd5198772e3af027157d', 1787268991915
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '67bd5417898f8098782cfc90ee61cb1a6a8d89275ef9fd5198772e3af027157d');

-- 0003_chief_snowbird
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '3dc88e4e3ed4b7308983a71c06328e2c7b7333363d071409a0b47bf1c8420a41', 1787269099136
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '3dc88e4e3ed4b7308983a71c06328e2c7b7333363d071409a0b47bf1c8420a41');

-- 0004_organic_scarecrow
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '815e4f4ee3f1885d2795641faf2ea0f26fee6c87d6da6832088a262c021f62e6', 1787273661971
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '815e4f4ee3f1885d2795641faf2ea0f26fee6c87d6da6832088a262c021f62e6');

-- 0005_orange_wong
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '2820a1273e9af44aa74c7751c22a570cc29f65b7dc45ceb5847b3d5ae827d38a', 1787273783691
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '2820a1273e9af44aa74c7751c22a570cc29f65b7dc45ceb5847b3d5ae827d38a');

-- 0006_neat_photon
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '9eb6cd5d0317651229cbfb420180ad83217858a2e61f6c8d21bebfec9b271fa7', 1787276749745
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '9eb6cd5d0317651229cbfb420180ad83217858a2e61f6c8d21bebfec9b271fa7');

-- 0007_smiling_deathstrike
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '2a866790ee174bbab90627c6354bb464b4ef092e5053a2fc8c6f83472f2a8372', 1787276974306
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '2a866790ee174bbab90627c6354bb464b4ef092e5053a2fc8c6f83472f2a8372');

-- 0008_eminent_doctor_octopus
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT 'f97cca79c33c43bb735e85a2c3149bb783ef0988433d5b466639ab6499b9dbb8', 1787286022988
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = 'f97cca79c33c43bb735e85a2c3149bb783ef0988433d5b466639ab6499b9dbb8');

-- 0009_open_mister_sinister
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '0be3f3be7a2c5a37324892368def9160e5b8ef691bebf2a5c33b2377d47e79e5', 1787286791837
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '0be3f3be7a2c5a37324892368def9160e5b8ef691bebf2a5c33b2377d47e79e5');

-- 0010_mixed_barracuda
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT 'd106b1b7409dface56a6a0fa8a01755634da10f1a63a95a86dc5750a14e34e84', 1787290977277
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = 'd106b1b7409dface56a6a0fa8a01755634da10f1a63a95a86dc5750a14e34e84');

-- 0011_strange_domino
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '09cec6aa9b1b8e5d64e493761bd5717be433151a27a34b968ea8f5800fec7c69', 1787352806496
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '09cec6aa9b1b8e5d64e493761bd5717be433151a27a34b968ea8f5800fec7c69');

-- 0012_vengeful_agent_zero
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT 'e9857789125ecced384bd36ac35219b30ce286d4395d517c06e2edf401afa14b', 1787355339435
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = 'e9857789125ecced384bd36ac35219b30ce286d4395d517c06e2edf401afa14b');

-- 0013_famous_wendell_rand
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT 'da675385c02c6a486237c3080550044dda3fdc10347b30b8b8fc70b15024ffa4', 1787375661164
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = 'da675385c02c6a486237c3080550044dda3fdc10347b30b8b8fc70b15024ffa4');

-- 0014_clumsy_ender_wiggin
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '42a6766b09520a35eda65bd3a93ff639d384d0c47b73dcbd496653666a88a721', 1787413915741
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '42a6766b09520a35eda65bd3a93ff639d384d0c47b73dcbd496653666a88a721');

-- 0015_unique_expediter
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT 'cd12005af3b35ae3eb8f9fd74806fb4f1a0afaea575def083f7322bf1843b516', 1787623593799
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = 'cd12005af3b35ae3eb8f9fd74806fb4f1a0afaea575def083f7322bf1843b516');

-- 0016_tidy_jane_foster
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT 'f29cca464fddd58acb869090b9727a29b5bc7afc8f1c7285e4e656a90a108af8', 1787623616406
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = 'f29cca464fddd58acb869090b9727a29b5bc7afc8f1c7285e4e656a90a108af8');

-- 0017_huge_kingpin
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '3b1fb6d4eaed481ef39e5077d3bb4dd2337c345a4d4af61118ee4c6acf17abcb', 1787673206526
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '3b1fb6d4eaed481ef39e5077d3bb4dd2337c345a4d4af61118ee4c6acf17abcb');

-- 0018_glorious_felicia_hardy
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT 'a3103415ce037c2982f872f312a8c61145d1b98556a13a35bcf76972cabb3cf6', 1787683411180
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = 'a3103415ce037c2982f872f312a8c61145d1b98556a13a35bcf76972cabb3cf6');

-- 0019_minor_iceman
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT 'a326884204dd3442b267f03a463c95514e8bb37ade56d334c7ccd7e69546a3b7', 1787683552035
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = 'a326884204dd3442b267f03a463c95514e8bb37ade56d334c7ccd7e69546a3b7');

-- 0020_nosy_talon
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '40508b4f8472a4f36d23d06908d282c3161e2485429fcfd0a59c51d264256229', 1787684334778
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '40508b4f8472a4f36d23d06908d282c3161e2485429fcfd0a59c51d264256229');

-- 0021_watery_drax
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '7ff671f3d941650c1d6c3eb73c76366f5a4144fc88368892049cdf6a16a55d40', 1787684388613
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '7ff671f3d941650c1d6c3eb73c76366f5a4144fc88368892049cdf6a16a55d40');

-- 0022_gifted_smiling_tiger
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '2d2a6ffa3deefc866a94f1cca3ceca6b9e2c6a636ae0f7ac1c21667bfa3f8455', 1787693116766
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '2d2a6ffa3deefc866a94f1cca3ceca6b9e2c6a636ae0f7ac1c21667bfa3f8455');

-- 0023_blue_wong
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '417bd75a3b7c2d7588da23863523c738226603ba3d3d42f18a70fe1fe9752d35', 1787693163241
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '417bd75a3b7c2d7588da23863523c738226603ba3d3d42f18a70fe1fe9752d35');

-- 0024_bouncy_ben_urich
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '553ebf61f146b8136d48353c069fb3dfca30e5eeaf78705ed5bab26744296dfd', 1787709606283
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '553ebf61f146b8136d48353c069fb3dfca30e5eeaf78705ed5bab26744296dfd');

-- 0025_superb_natasha_romanoff
INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
SELECT '9193d474ca3a99f97ff78148465cc05b5a71bd331321c2c6f6b6fd0649a6d85e', 1787761248350
WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = '9193d474ca3a99f97ff78148465cc05b5a71bd331321c2c6f6b6fd0649a6d85e');

