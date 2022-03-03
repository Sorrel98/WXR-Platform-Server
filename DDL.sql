CREATE DATABASE wxr_server DEFAULT CHARACTER SET utf8mb4;
USE wxr_server;

########################################################
/* Paste here the exported sql from a erd tool */
CREATE TABLE `t_avatar` (
  `id` INT PRIMARY KEY NOT NULL,
  `name` VARCHAR(45) NOT NULL,
  `model_path` VARCHAR(45) NOT NULL
);

CREATE TABLE `t_user` (
  `id` INT PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  `email` VARCHAR(45) NOT NULL,
  `passwd` VARCHAR(64) NOT NULL,
  `is_admin` BIT(1) NOT NULL DEFAULT 0,
  `avatar_id` INT NOT NULL DEFAULT 0,
  `vr_hand_sync` BIT(1) NOT NULL DEFAULT 0
);

CREATE TABLE `t_workspace` (
  `id` INT PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `owner` INT NOT NULL,
  `name` VARCHAR(45) NOT NULL,
  `created_date` DATETIME NOT NULL,
  `vr_options` VARCHAR(128) DEFAULT "enableOneHandTrigger:true;enableTwoHandTrigger:true;enableTwoHandGrip:true;floorHeight:0;moveSpeed:2",
  `content` MEDIUMTEXT,
  `description` TINYTEXT,
  `thumbnail` TEXT
);

CREATE TABLE `t_role` (
  `id` INT PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL
);

CREATE TABLE `t_authority` (
  `id` INT PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL
);

CREATE TABLE `t_participation` (
  `id` INT PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `uid` INT NOT NULL,
  `wid` INT NOT NULL,
  `rid` INT NOT NULL,
  `bookmark` BIT(1) NOT NULL,
  `access_date` DATETIME
);

CREATE TABLE `t_tag` (
  `id` INT PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `wid` INT NOT NULL,
  `name` VARCHAR(45) NOT NULL
);

CREATE TABLE `t_auth_role_relation` (
  `aid` INT NOT NULL,
  `rid` INT NOT NULL,
  PRIMARY KEY (`aid`, `rid`)
);

CREATE TABLE `t_invite` (
  `id` INT PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `sender_id` INT NOT NULL,
  `receiver_id` INT NOT NULL,
  `message` TINYTEXT,
  `workspace_id` INT NOT NULL,
  `created_date` DATETIME NOT NULL
);

CREATE TABLE `t_asset_item` (
  `id` INT PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  `parent_dir` INT,
  `owner_id` INT,
  `item_type` DECIMAL(1) NOT NULL COMMENT '0:dir, 1: target, 2: binary'
);

CREATE TABLE `t_asset_share` (
  `as_id` INT NOT NULL,
  `uid` INT NOT NULL,
  PRIMARY KEY (`as_id`, `uid`)
);

CREATE TABLE `t_general_feature` (
  `id` INT PRIMARY KEY NOT NULL,
  `type` VARCHAR(45) NOT NULL,
  `width` FLOAT NOT NULL,
  `height` FLOAT,
  `depth` FLOAT,
  `bin` MEDIUMBLOB NOT NULL
);

CREATE TABLE `t_vuforia_feature` (
  `id` INT PRIMARY KEY NOT NULL,
  `type` VARCHAR(45) NOT NULL,
  `xml` BLOB NOT NULL,
  `dat` MEDIUMBLOB NOT NULL
);

CREATE TABLE `t_binary_data` (
  `id` INT PRIMARY KEY NOT NULL,
  `data` LONGBLOB NOT NULL,
  `path` TINYTEXT
);

CREATE TABLE `t_template` (
  `id` INT PRIMARY KEY NOT NULL,
  `data` TEXT NOT NULL,
  `verified` BIT(1) NOT NULL
);

CREATE TABLE `t_workspace_session` (
  `id` INT PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `wid` INT NOT NULL,
  `start_time` DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP),
  `end_time` DATETIME,
  `log_msgs` LONGTEXT NOT NULL DEFAULT ""
);

ALTER TABLE `t_user` ADD FOREIGN KEY (`avatar_id`) REFERENCES `t_avatar` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_workspace` ADD FOREIGN KEY (`owner`) REFERENCES `t_user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_participation` ADD FOREIGN KEY (`uid`) REFERENCES `t_user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_participation` ADD FOREIGN KEY (`wid`) REFERENCES `t_workspace` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_participation` ADD FOREIGN KEY (`rid`) REFERENCES `t_role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_tag` ADD FOREIGN KEY (`wid`) REFERENCES `t_workspace` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_auth_role_relation` ADD FOREIGN KEY (`aid`) REFERENCES `t_authority` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_auth_role_relation` ADD FOREIGN KEY (`rid`) REFERENCES `t_role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_invite` ADD FOREIGN KEY (`workspace_id`) REFERENCES `t_workspace` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_invite` ADD FOREIGN KEY (`receiver_id`) REFERENCES `t_user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_invite` ADD FOREIGN KEY (`sender_id`) REFERENCES `t_user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_asset_item` ADD FOREIGN KEY (`parent_dir`) REFERENCES `t_asset_item` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_asset_item` ADD FOREIGN KEY (`owner_id`) REFERENCES `t_user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_asset_share` ADD FOREIGN KEY (`uid`) REFERENCES `t_user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_asset_share` ADD FOREIGN KEY (`as_id`) REFERENCES `t_asset_item` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_general_feature` ADD FOREIGN KEY (`id`) REFERENCES `t_asset_item` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_vuforia_feature` ADD FOREIGN KEY (`id`) REFERENCES `t_asset_item` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_binary_data` ADD FOREIGN KEY (`id`) REFERENCES `t_asset_item` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_template` ADD FOREIGN KEY (`id`) REFERENCES `t_asset_item` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `t_workspace_session` ADD FOREIGN KEY (`wid`) REFERENCES `t_workspace` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX `t_user_Unique_Index_1` ON `t_user` (`email`);

CREATE UNIQUE INDEX `t_user_Unique_Index_2` ON `t_user` (`name`);

CREATE INDEX `ix_t_tag_name` ON `t_tag` (`name`);

CREATE UNIQUE INDEX `t_asset_item_Index_1` ON `t_asset_item` (`parent_dir`, `name`);
########################################################


INSERT INTO t_avatar VALUES(0, 'head', '/models/head.glb');
INSERT INTO t_avatar VALUES(1, 'camera', '/models/cam.glb');
INSERT INTO t_avatar VALUES(2, 'hmd', '/models/hmd.glb');
INSERT INTO t_avatar VALUES(3, 'minions', '/models/minions_bald.glb');

INSERT INTO t_asset_item(name, item_type) values('public', 0);

INSERT INTO t_authority(name) values('AlterWorkspace');
INSERT INTO t_authority(name) values('Invite');
INSERT INTO t_authority(name) values('EditRole(M)');
INSERT INTO t_authority(name) values('EditRole(P)');
INSERT INTO t_authority(name) values('Write');
INSERT INTO t_authority(name) values('Read');

INSERT INTO t_role(name) values('Master');
INSERT INTO t_role(name) values('Manager');
INSERT INTO t_role(name) values('Inviter');
INSERT INTO t_role(name) values('Writer');
INSERT INTO t_role(name) values('Audience');

INSERT INTO t_auth_role_relation values(1, 1);
INSERT INTO t_auth_role_relation values(2, 1);
INSERT INTO t_auth_role_relation values(3, 1);
INSERT INTO t_auth_role_relation values(4, 1);
INSERT INTO t_auth_role_relation values(5, 1);
INSERT INTO t_auth_role_relation values(6, 1);
INSERT INTO t_auth_role_relation values(2, 2);
INSERT INTO t_auth_role_relation values(3, 2);
INSERT INTO t_auth_role_relation values(4, 2);
INSERT INTO t_auth_role_relation values(5, 2);
INSERT INTO t_auth_role_relation values(6, 2);
INSERT INTO t_auth_role_relation values(2, 3);
INSERT INTO t_auth_role_relation values(4, 3);
INSERT INTO t_auth_role_relation values(5, 3);
INSERT INTO t_auth_role_relation values(6, 3);
INSERT INTO t_auth_role_relation values(5, 4);
INSERT INTO t_auth_role_relation values(6, 4);
INSERT INTO t_auth_role_relation values(6, 5);
