const util = require('util');

const express = require('express');
const router = express.Router();
const axios = require('axios');
const multiparty = require('multiparty');

const dbPool = require('../lib/DBpool').dbPool;
const { UnauthorizedError, BadRequestError, NotFoundError, InternalServerError, ForbiddenError } = require('../lib/errors');


router.get('/assetInfo', async (request, response, next) => {

	const uid = request.session.uid;
	if (!uid) {
		return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
	}

	let astId = null;
	if (request.query.id) {
		astId = parseInt(request.query.id);
		if (isNaN(astId)) {
			return next(new BadRequestError(`Invalid asset id. request.query: ${util.inspect(request.query, true, 2, true)}`));
		}
	}

	let conn;
	let toResp;
	try {
		conn = await dbPool.getConnection();
		const res1 = await conn.query(`select * from t_asset_item where parent_dir ${(astId ? '= ' + astId : 'is NULL')} and (owner_id is NULL or owner_id = ?)`, uid);

		// Recursively check access permission upward along asset hierarchy starting from the requested asset.
		const bottomUpSearch = async (pathArr) => {
			const _astId = pathArr[0].id;

			// When reaching the root directory, escape recursive search.
			if (!_astId) {
				// Append suffix about asset type and read permission.
				pathArr[0].name = 'assets' + ((pathArr.length === 1) ? 'du' : '');
				// Return the search result and escape bottomUpSearch recursion.
				return pathArr;
			}

			const res2 = await conn.query(`select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?)`, [_astId, uid]);
			if (res2.length !== 1) {
				throw new NotFoundError(`Couldn't found the requested asset. astid: ${_astId}, uid: ${uid}`);
			}

			if (pathArr.length === 1) {
				const types = ['d', 't', 'b', 'c'];
				res2[0].name += types[res2[0].item_type] + (res2[0].owner_id ? 'r' : 'u');
			}
			pathArr[0].name = res2[0].name;

			pathArr.unshift({ id: res2[0].parent_dir, name: null });

			return await bottomUpSearch(pathArr);
		};
		const pathArr = await bottomUpSearch([{ id: astId, name: null }]);

		const curItemName = pathArr[pathArr.length - 1].name.split('');
		const isPrivate = curItemName.pop() === 'r' ? true : false;
		const assetType = curItemName.pop();
		pathArr[pathArr.length - 1].name = curItemName.join('');

		let res3 = [];
		if (astId) {
			res3 = await conn.query(`select id, name, email from t_user as u join t_asset_share as ash on u.id = ash.uid where ash.as_id = ?`, astId);
		}

		let res4;
		switch (assetType) {
			case 'd':
				res4 = null;
				break;

			case 't':
				//feature meta data array
				res4 = await conn.query(`select 'vuforia_feature' as feature_type, type, hex(left(dat, 4)) as signature, NULL as width, NULL as height, NULL as depth from t_vuforia_feature where id = ? union all select 'general_feature' as feature_type, type, hex(left(bin, 4)) as signature, width, height, depth from t_general_feature where id = ?`, [astId, astId]);
				break;

			case 'b':
				//binary data size
				res4 = await conn.query(`select length(data) as size, hex(left(data, 4)) as signature from t_binary_data where id = ?`, astId);
				res4 = (res4.length === 1) ? res4[0] : null;
				break;

			case 'c':
				//content source
				res4 = await conn.query(`select data from t_template where id = ?`, astId);
				res4 = (res4.length === 1) ? res4[0] : null;
				break;

			default:
				throw new InternalServerError(`Invalid asset type. asset type: ${assetType}`);
		}

		conn.release();

		toResp = {
			pathArr: pathArr,
			children: res1,
			isPrivate: isPrivate,
			assetType: assetType,
			shareTo: res3,
			metaData: res4
		};

	} catch (err) {
		if (conn) {
			conn.release();
		}

		// conn error (500), res1 error (500), res2 error (500), Not found (404), res4 error (500)
		return next(err);
	}

	response.status(200).json(toResp);
});

router.post('/makeDirectory', async (request, response, next) => {

	const uid = request.session.uid;
	if (!uid) {
		return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
	}

	let { parentId, astName } = request.body;
	parentId = parseInt(parentId);
	if (isNaN(parentId) || !astName) {
		return next(new BadRequestError(`Invalid asset name or parent asset id. request.body: ${util.inspect(request.body, true, 2, true)}`));
	}

	let data = { id: undefined, name: astName, parent_dir: parentId, owner_id: undefined, item_type: 0 };
	let conn;
	try {
		conn = await dbPool.getConnection();
		const res1 = await conn.query(`select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 0`, [parentId, uid]);
		if (res1.length !== 1) {
			throw new ForbiddenError(`Nonexistent or unauthorized directory access. parent asset id: ${parentId}, uid: ${uid}`);
		}

		const res2 = await conn.query(`insert into t_asset_item(name, parent_dir, owner_id, item_type) values(?, ?, ?, 0)`, [astName, parentId, res1[0].owner_id]);
		conn.release();

		data.id = res2.insertId;
		data.owner_id = res1[0].owner_id;

	} catch (err) {
		if (conn) {
			conn.release();
		}

		// conn error (500), res1 error (500), Invalid directory access (412), res2 error (500)
		// if(err2.errno === 1169) => duplicated name error (412)
		return next(err);
	}

	response.status(200).json(data);
});

router.post('/makeBinaryFromURI', async (request, response, next) => {

	const uid = request.session.uid;
	if (!uid) {
		return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
	}

	let { parentId, astName, srcURI } = request.body;
	parentId = parseInt(parentId);
	if (isNaN(parentId) || !astName || !srcURI) {
		return next(new BadRequestError(`Invalid parent asset id or asset name or uri. request.body: ${util.inspect(request.body, true, 2, true)}`));
	}

	let httpCl;
	try {	// URL format validation
		srcURI = new URL(srcURI);
		switch (srcURI.protocol) {
			case 'http:': httpCl = require('http'); break;
			case 'https:': httpCl = require('https'); break;
			default: throw new BadRequestError(`Invalid URI format. URI: ${srcURI}`);
		}
	} catch (err) {
		// Invalid URL error
		return next(err);
	}

	let data = { id: undefined, name: astName, parent_dir: parentId, owner_id: undefined, item_type: 2 };
	let conn;
	try {
		conn = await dbPool.getConnection();

		const res1 = await conn.query(`select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 0`, [parentId, uid]);
		if (res1.length !== 1) {
			throw new ForbiddenError(`Nonexistent or unauthorized directory access. parent asset id: ${parentId}, uid: ${uid}`);
		}

		const res = await axios.get(srcURI.href, { responseType: 'arraybuffer' });
		if (res.status !== 200) {
			throw InternalServerError(`HTTP/HTTPS response status err. status: ${res.status}, response: ${res}`);
		}

		await conn.beginTransaction();
		const res2 = await conn.query(`insert into t_asset_item(name, parent_dir, owner_id, item_type) values(?, ?, ?, 2)`, [astName, parentId, res1[0].owner_id]);
		const res3 = await conn.query("insert into t_binary_data(id, data) values(?, ?)", [res2.insertId, res.data]);
		conn.commit();
		conn.release();

		data.id = res2.insertId;
		data.owner_id = res1[0].owner_id;

	} catch (err) {
		if (conn) {
			conn.rollback();
			conn.release();
		}

		// conn error (500), res1 error (500), Invalid directory access (412), transaction error (500) res2 error (500)
		// if(err2.errno === 1169) => duplicated name error (412)
		// http/https request error (500), http/https response error (500)
		// res3 error (500)
		return next(err);
	}

	response.status(200).json(data);
});

router.post('/makeBinaryFromUpload', (request, response, next) => {

	const uid = request.session.uid;
	if (!uid) {
		return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
	}

	let parentId, astName;
	let form = new multiparty.Form();
	form.on('field', (name, value) => {
		switch (name) {
			case 'parentId': parentId = parseInt(value); break;
			case 'astName': astName = value;
		}
	});

	form.on('part', async (partDataStream) => {

		if (partDataStream.name !== 'src') {
			partDataStream.resume();
			return;		// No error???
		}

		if (isNaN(parentId) || !astName) {
			partDataStream.resume();
			return next(new BadRequestError(`Invalid parent asset id or asset name. parent id: ${parentId}, asset name: ${astName}`));
		}

		let data = { id: undefined, name: astName, parent_dir: parentId, owner_id: undefined, item_type: 2 };
		let conn;
		try {
			conn = await dbPool.getConnection();
			const res1 = await conn.query(`select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 0`, [parentId, uid]);
			if (res1.length !== 1) {
				throw new ForbiddenError(`Nonexistent or unauthorized directory access. parent asset id: ${parentId}, uid: ${uid}`);
			}

			await conn.beginTransaction();
			const res2 = await conn.query("insert into t_asset_item(name, parent_dir, owner_id, item_type) values(?, ?, ?, 2)", [astName, parentId, res1[0].owner_id]);
			const res3 = await conn.query("insert into t_binary_data(id, data) values(?, ?)", [res2.insertId, partDataStream]);
			conn.commit();
			conn.release();

			data.id = res2.insertId;
			data.owner_id = res1[0].owner_id;

		} catch (err) {
			if (conn) {
				conn.rollback();
				conn.release();
			}

			// conn error (500), res1 error (500), Invalid directory access (412), transaction error (500), res2 error (500)
			// if(err2.errno === 1169) => duplicated name error (412), res3 error (500)
			return next(err);
		}

		response.status(200).json(data);
	});

	form.parse(request);
});

// Create an abstract target
router.post('/makeTarget', async (request, response, next) => {

	const uid = request.session.uid;
	if (!uid) {
		return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
	}

	const parentId = parseInt(request.body.parentId);
	const astName = request.body.astName;
	if (isNaN(parentId) || !astName) {
		return next(new BadRequestError(`Invalid parentasset id or asset name. request.body: ${util.inspect(request.body, true, 2, true)}`));
	}

	let data = { id: undefined, name: astName, parent_dir: parentId, owner_id: undefined, item_type: 1 };
	let conn;
	try {
		conn = await dbPool.getConnection();
		const res1 = await conn.query(`select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 0`, [parentId, uid]);
		if (res1.length !== 1) {
			throw new ForbiddenError(`Nonexistent or unauthorized directory access. parent asset id: ${parentId}, uid: ${uid}`);
		}

		const res2 = await conn.query(`insert into t_asset_item(name, parent_dir, owner_id, item_type) values(?, ?, ?, 1)`, [astName, parentId, res1[0].owner_id]);
		conn.release();

		data.id = res2.insertId;
		data.owner_id = res1[0].owner_id;

	} catch (err) {
		if (conn) {
			conn.release();
		}

		// conn error (500), res1 error (500), Invalid directory access (412), res2 error (500)
		// if(err2.errno === 1169) => duplicated name error (412)
		return next(err);
	}

	response.status(200).json(data);
});

//Currently only supports 2d images
router.post('/makeTargetGeneralFeature', async (request, response, next) => {

	const uid = request.session.uid;
	if (!uid) {
		return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
	}

	let targetId, width;
	let form = new multiparty.Form();
	form.on('field', (name, value) => {
		switch (name) {
			case 'targetId': targetId = parseInt(value); break;
			case 'width': width = parseFloat(value); break;
		}
	});

	form.on('part', async (partDataStream) => {

		if (partDataStream.name !== 'src') {
			partDataStream.resume();	// No error???
			return;
		}

		if (isNaN(targetId) || isNaN(width)) {
			partDataStream.resume();
			return next(new BadRequestError(`Invalid target id or width value. target id: ${targetId}, width: ${width}`));
		}

		let conn;
		try {
			conn = await dbPool.getConnection();
			const res1 = await conn.query(`select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 1`, [targetId, uid]);
			if (res1.length !== 1) {
				throw new ForbiddenError(`Nonexistent or unauthorized directory access. parent asset id: ${targetId}, uid: ${uid}`);
			}

			await conn.beginTransaction();
			const res2 = await conn.query(`delete from t_general_feature where id = ?`, targetId);
			const res3 = await conn.query(`insert into t_general_feature(id, type, width, bin) values(?, '2d', ?, ?)`, [targetId, width, partDataStream]);
			conn.commit();

		} catch (err) {
			if (conn) {
				conn.rollback();
				conn.release();
			}

			// conn error (500), res1 error (500), Invalid access (412), transaction error (500), res2 error (500), res3 error (500)
			return next(err);
		}

		try {
			const res4 = await conn.query(`select type, hex(left(bin, 4)) as signature from t_general_feature where id = ?`, targetId);
			response.status(200).json(res4[0]);
		} catch (err) {
			// The update has been completed, but this page contains expired information
			console.log(err);
			response.status(200).end();
		}

		conn.release();

	});

	form.parse(request);
});

// TODO: Unit test
router.post('/makeTargetVuforiaFeature', (request, response, next) => {

	const uid = request.session.uid;
	if (!uid) {
		return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
	}

	let targetId, type;
	let xmlStream;
	let form = new multiparty.Form();
	form.on('field', (name, value) => {
		switch (name) {
			case 'targetId': targetId = parseInt(value); break;
			case 'type': type = value; break;
		}
	});

	form.on('part', async (partDataStream) => {

		if (partDataStream.name === 'xml') {
			xmlStream = partDataStream;
		}
		else if (partDataStream.name === 'dat') {

			if (isNaN(targetId) || !type || !xmlStream) {
				partDataStream.resume();
				return next(new BadRequestError(`Invalid target id or type or xml. target id: ${targetId}, type: ${type}, xml: ${util.inspect(xmlStream, true, 2, true)}`));
			}

			let conn;
			try {
				conn = await dbPool.getConnection();
				const res1 = await conn.query(`select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 1`, [targetId, uid]);
				if (res1.length !== 1) {
					throw new ForbiddenError(`Nonexistent or unauthorized directory access. parent asset id: ${targetId}, uid: ${uid}`);
				}

				await conn.beginTransaction();
				const res2 = await conn.query(`delete from t_vuforia_feature where id = ?`, targetId);
				const res3 = await conn.query(`insert into t_vuforia_feature(id, type, xml, dat) values(?, ?, ?, ?)`, [targetId, type, xmlStream, partDataStream]);
				conn.commit();

			} catch (err) {
				if (conn) {
					conn.rollback();
					conn.release();
				}

				// conn error (500), res1 error (500), Invalid access (412), transaction error (500), res2 error (500)
				// res3 error (500), res4 error (500)
				return next(err);
			}

			try {
				const res4 = await conn.query(`select type, hex(left(dat,4)) as signature from t_vuforia_feature where id = ?`, targetId);
				response.status(200).json(res4[0]);
			} catch (err) {
				// The update has been completed, but this page contains expired information
				console.log(err);
				response.status(200).end();
			}

			conn.release();

		}
		else {
			return next(new BadRequestError(`Didn't receive 'xml' or 'dat'.`));
		}
	});

	form.parse(request);
});

router.post('/makeTemplate', async (request, response, next) => {

	const uid = request.session.uid;
	if (!uid) {
		return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
	}

	let parentId = parseInt(request.body.parentId);
	let astName = request.body.astName;
	if (isNaN(parentId) || !astName) {
		return next(new BadRequestError(`Invalid parent asset id or asset name. request.body: ${util.inspect(request.body, true, 2, true)}`));
	}

	let data = { id: undefined, name: astName, parent_dir: parentId, owner_id: undefined, item_type: 3 };
	let conn;
	try {
		conn = await dbPool.getConnection();
		const res1 = await conn.query(`select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 0`, [parentId, uid]);
		if (res1.length !== 1) {
			throw new ForbiddenError(`Nonexistent or unauthorized directory access. parent asset id: ${parentId}, uid: ${uid}`);
		}

		await conn.beginTransaction();
		const res2 = await conn.query(`insert into t_asset_item(name, parent_dir, owner_id, item_type) values(?, ?, ?, 3)`, [astName, parentId, res1[0].owner_id]);
		const res3 = await conn.query(`insert into t_template(id, data, verified) values(?, '', b'0')`, res2.insertId);
		conn.commit();
		conn.release();

		data.id = res2.insertId;
		data.owner_id = res1[0].owner_id;

	} catch (err) {
		if (conn) {
			conn.rollback();
			conn.release();
		}

		// conn error (500), res1 error (500), Invalid directory access (412), transaction error (500), res2 error (500)
		// if(err2.errno === 1169) => duplicated name error (412), res3 error (500)
		return next(err);
	}

	response.status(200).json(data);
});

router.post('/commitContent', async (request, response, next) => {

	const uid = request.session.uid;
	if (!uid) {
		return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
	}

	const astId = parseInt(request.body.astId);
	if (isNaN(astId)) {
		return next(new BadRequestError(`Invalid asset id. request.body: ${util.inspect(request.body, true, 2, true)}`));
	}

	const contentSource = request.body.source.replace(/'/g, `"`);
	// todo : Check content source validation

	let conn;
	try {
		conn = await dbPool.getConnection();
		await conn.query(`update t_template set data = ?, verified = b'1' where id = ?`, [contentSource, astId]);
		conn.release();

	} catch (err) {
		if (conn) {
			conn.release();
		}

		// conn error (500), res1 error (500)
		return next(err);
	}

	response.status(200).end();
});

router.post('/removeAsset', async (request, response, next) => {

	const uid = request.session.uid;
	if (!uid) {
		return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
	}

	const astId = request.body.astId;
	if (!astId) {
		return next(new BadRequestError(`Invalid parent asset id or asset name. request.body: ${util.inspect(request.body, true, 2, true)}`));
	}

	let conn;
	try {
		conn = await dbPool.getConnection();
		const res1 = await conn.query(`delete from t_asset_item where id = ? and parent_dir is not null and (owner_id is null or owner_id = ?)`, [astId, uid]);
		if (res1.affectedRows === 0) {
			throw new ForbiddenError(`Nonexistent or unauthorized asset access. asset id: ${astId}, uid: ${uid}`);
		}

		conn.release();

	} catch (err) {
		if (conn) {
			conn.release();
		}

		// conn error (500), res1 error (500), Invalid asset access (412)
		return next(err);
	}

	response.status(200).end();
});

router.post('/renameAsset', async (request, response, next) => {

	const uid = request.session.uid;
	if (!uid) {
		return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
	}

	const { astId, astName } = request.body;
	if (!astId || !astName) {
		return next(new BadRequestError(`Invalid asset id or asset name. request.body: ${util.inspect(request.body, true, 2, true)}`));
	}

	let conn;
	try {
		conn = await dbPool.getConnection();
		const res1 = await conn.query(`update t_asset_item set name = ? where id = ? and parent_dir is not null and (owner_id is null or owner_id = ?)`, [astName, astId, uid]);
		if (res1.affectedRows === 0) {
			throw new ForbiddenError(`Nonexistent or unauthorized asset access. asset name: ${astName}, asset id: ${astId}, uid: ${uid}`);
		}

		conn.release();

	} catch (err) {
		if (conn) {
			conn.release();
		}

		// conn error (500), res1 error (500), Invalid asset access (412)
		return next(err);
	}

	response.status(200).end();
});

router.post('/shareAsset', async (request, response, next) => {

	const uid = request.session.uid;
	if (!uid) {
		return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
	}

	const astId = request.body.astId;
	let targets = request.body.targets;
	if (!astId || !targets) {
		return next(new BadRequestError(`Invalid asset id or targets. request.body: ${util.inspect(request.body, true, 3, true)}`));
	}

	if (typeof targets === 'string') {
		targets = [targets];
	}
	if (!(targets instanceof Array)) {
		return next(new BadRequestError(`Invalid targets is not array type. targets: ${util.inspect(targets, true, 2, true)}`));
	}

	let conn;
	let affectedPersons = [];
	try {
		conn = await dbPool.getConnection();
		const res1 = await conn.query(`select count(*) as canShare from t_asset_item where id = ? and owner_id = ?`, [astId, uid]);
		if (res1[0].canShare !== 1) {
			throw new ForbiddenError(`Nonexistent or unauthorized asset access. asset id: ${astId}, uid: ${uid}`);
		}

		for await (const target of targets) {
			try {
				if (typeof target !== 'string') {
					throw new BadRequestError(`Invalid user name or email. target: ${target}, targets: ${targets}`);
				}

				const isEmail = (target.indexOf('@') !== -1);
				const res2 = await conn.query(`select id, name, email from t_user where ${(isEmail ? 'email' : 'name')} = ?`, target);
				if (res2.length !== 1) {
					throw new BadRequestError(`The request user does not exist. target: ${target}, targets: ${targets}`);
				}
				if (res2[0].id === uid) {
					throw new BadRequestError(`The asset is already shared. uid: ${uid}, target user id: ${res2[0].id}, target: ${target}, targets: ${targets}`);
				}

				const res3 = await conn.query(`insert into t_asset_share(as_id, uid) values(?, ?)`, [astId, res2[0].id]);

				affectedPersons.push(res2[0]);

			} catch (err) {
				throw err;
			}
		}

		conn.release();

	} catch (err) {
		if (conn) {
			conn.release();
		}

		if (err.errno === 1062) {
			return next(new BadRequestError(`The asset is already shared. error: ${util.inspect(err, true, 1, true)}`));
		}

		// conn error (500), res1 error (500), Invalid asset access (412), Nonexistent user (500), res2 error (500)
		// if(err3.errno === 1169) => Already shared (412), res3 error (500)
		return next(err);
	}

	response.status(200).json(affectedPersons);
});

router.post('/unshareAsset', async (request, response, next) => {

	const uid = request.session.uid;
	if (!uid) {
		return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
	}

	const { astId, targetId } = request.body;
	if (!astId || !targetId) {
		return next(new BadRequestError(`Invalid asset id or target id. request.body: ${util.inspect(request.body, true, 2, true)}`));
	}

	let conn;
	try {
		conn = await dbPool.getConnection();
		const res1 = await conn.query(`select count(*) as canShare from t_asset_item where id = ? and owner_id = ?`, [astId, uid]);
		if (res1[0].canShare !== 1) {
			throw new ForbiddenError(`Nonexistent or unauthorized asset access. asset id: ${astId}, uid: ${uid}`);
		}

		const res2 = await conn.query(`delete from t_asset_share where as_id = ? and uid = ?`, [astId, targetId]);
		if (res2.affectedRows !== 1) {
			new UnauthorizedError(`The asset is already unshared. asset id: ${astId}, target user id: ${targetId}`);
		}

		conn.release();

	} catch (err) {
		if (conn) {
			conn.release();
		}

		// conn error (500), res1 error (500), Invalid asset access (412), res2 error (500), Already unshared (412)
		return next(err);
	}

	response.status(200).end();
});

router.get('/assetRawData', async (request, response, next) => {

	const uid = request.session.uid;
	if (!uid) {
		return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
	}

	const assetId = parseInt(request.query.assetId);
	const featureType = request.query.featureType;
	if (isNaN(assetId)) {
		return next(new BadRequestError(`Invalid asset id. request.query: ${util.inspect(request.query, true, 2, true)}`));
	}

	let contentHeader, data;
	let conn;
	try {
		conn = await dbPool.getConnection();

		// Recursively read access permission upward along asset hierarchy starting from the requested asset.
		const bottomUpAuthCheck = async (id, auth) => {
			if (id === null) {
				if (auth !== 1) {
					throw new UnauthorizedError(`Unauthorized access. asset id: ${id}, auth: ${auth}`);
				}
				return true;
			}
			// Check access permission for the current level.
			const res1 = await conn.query(`select parent_dir, (owner_id is null or owner_id = ? or (select count(*) from t_asset_share where as_id = id and uid = ?)) as auth from t_asset_item where id = ?`, [uid, uid, id]);
			if (res1.length !== 1) {
				throw new UnauthorizedError(`Unauthorized access. uid: ${uid}, asset id: ${id}`);
			}

			// When successfully reaching the topmost asset, the root directory, the parent_dir is null.
			return await bottomUpAuthCheck(res1[0].parent_dir, res1[0].auth | auth);
		}
		await bottomUpAuthCheck(assetId, 1);

		const res2 = await conn.query(`select name, item_type from t_asset_item where id = ?`, assetId);
		if (res2.length !== 1) {
			throw new InternalServerError(`The asset does not exist. asset id: ${assetId}`);
		}

		let query, header;
		switch (res2[0].item_type) {
			case 0:
				throw new BadRequestError(`Undefined asscess (downlaod a directory). asset info: ${util.inspect(res2[0], true, 2, true)}`);

			case 1:
				switch (featureType) {
					case 'general_feature':
						query = `select bin from t_general_feature where id = ?`;
						header = ['Content-disposition', `filename=${res2[0].name}/genereal`];
						break;

					case 'vuforia_feature':
						query = `select dat as bin from t_vuforia_feature where id = ?`;
						header = ['Content-disposition', `attachment; filename=${res2[0].name}/vuforia.dat`];
						break;

					default:
						throw new InternalServerError(`Invalid feature type. asset info: ${util.inspect(res2[0], true, 2, true)}`);

				}
				break;

			case 2:
				query = `select data as bin from t_binary_data where id = ?`;
				header = ['Content-disposition', `attachment; filename=${res2[0].name}`];
				break;

			case 3:
				query = `select data as bin from t_template where id = ?`;
				header = ['Content-disposition', `attachment; filename=${res2[0].name}`];
				break;

			default:
				throw new InternalServerError(`Invalid item type. asset info: ${util.inspect(res2[0], true, 2, true)}`);
		}

		const res3 = await conn.query(query, assetId);
		if (res3.length !== 1) {
			throw new InternalServerError(`The requested asset does not exist. query: ${query}, asset id: ${assetId}`);
		}

		conn.release();

		data = res3[0].bin;
		contentHeader = header;

	} catch (err) {
		if (conn) {
			conn.release();
		}

		// conn error (500), res1 error (500), Unauthorized access (403), res2 error (500), res2 error (500), res3 error (500)
		return next(err);
	}

	response.setHeader(...contentHeader);
	response.end(data, 'binary');
});

router.get('/assets/:path([^/]+(?:/[^/]+)*)', async (request, response, next) => {

	const uid = request.session.uid;
	if (!uid) {
		return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
	}

	// If it is target feature, a suffix (eg., /general or /vuforia) is appended to the passed path
	const pathArr = request.params.path.split('/');
	let conn;
	try {
		conn = await dbPool.getConnection();

		const res1 = await conn.query(`select id, (owner_id is null or owner_id = ?) as auth, name from t_asset_item where parent_dir is null and name = ?`, [uid, pathArr[0]]);
		if (res1.length !== 1) {
			throw new NotFoundError(`Couldn't find the first object in the path. uid: ${uid}, path: ${util.inspect(pathArr, true, 2, true)}`);
		}

		// Recursively find the target asset along with the given path.
		const topdownAssetSearch = async (prevResult, pathArr) => {

			if (pathArr.length == 0) {
				throw new BadRequestError(`Undefined access (access a directory). name: ${prevResult[0].name}`);
			}

			// Retrieve the first asset in the pathArr queue.
			const name = pathArr.shift();
			const parentId = prevResult[0].id;
			let res2 = await conn.query(`select id, (owner_id is null or owner_id = ? or (select count(*) from t_asset_share where as_id = id and uid = ?)) as auth, item_type, name from t_asset_item where parent_dir = ? and name = ?`, [uid, uid, parentId, name]);
			if (res2.length !== 1) {
				throw new NotFoundError(`Failed to find '${name}'. uid: ${uid}, parent id: ${parentId}, name: ${name}`);
			}

			// If any parent assets allowed to be accessed exist, 
			// the user also has access permission for the current asset.
			res2[0].auth |= prevResult[0].auth;

			// Check escape condition.
			if ((res2[0].item_type === 1 && pathArr.length === 1) 		// ar target
				|| (res2[0].item_type > 1 && pathArr.length === 0)) {		// others except directory

				if (res2[0].auth !== 1) {
					throw new ForbiddenError(`The requested access has no permission`);
				}

				return res2;
			}

			return await topdownAssetSearch(res2, pathArr);
		}
		const asset = await topdownAssetSearch(res1, pathArr.slice(1));		// pathArr.slice() returns the copy of pathArr.

		switch (asset[0].item_type) {
			case 1:	// ar target
				switch (pathArr.pop()) {
					case 'general': {
						const res3 = await conn.query(`select * from t_general_feature where id = ?`, asset[0].id);
						if (res3.length !== 1) {
							throw new NotFoundError(`Couldn't find general feature. asset id: ${asset[0].id}`);		// The target has not general feature
						}

						response.writeHead(200);

						if (res3[0].type === '2d') {
							response.write(Buffer.alloc(1, 0));
						}
						else if (res3[0].type === '3d') {
							response.write(Buffer.alloc(1, 1));
						}
						else {
							response.write(Buffer.alloc(1, 255));
						}

						const dv = new DataView(new ArrayBuffer(4));
						dv.setFloat32(0, res3[0].width, false);
						response.write(Buffer.from(new Uint8Array(dv.buffer)), 'binary');
						dv.setFloat32(0, res3[0].height, false);
						response.write(Buffer.from(new Uint8Array(dv.buffer)), 'binary');
						dv.setFloat32(0, res3[0].depth, false);
						response.write(Buffer.from(new Uint8Array(dv.buffer)), 'binary');
						response.write(res3[0].bin, 'binary');
						break;
					}
					case 'vuforia': {
						//todo : unit test
						const res3 = await conn.query(`select type, xml, length(xml) as len, dat from t_vuforia_feature where id = ?`, asset[0].id);
						if (res3.length !== 1) {
							throw new NotFoundError(`Couldn't find vuforia feature. asset id: ${asset[0].id}`);		// The target has not vuforia feature
						}

						response.writeHead(200);

						switch (res3[0].type) {
							case 'SingleImage': response.write(Buffer.alloc(1, 0)); break;
							case 'Cuboid': response.write(Buffer.alloc(1, 1)); break;
							case 'Cylinder': response.write(Buffer.alloc(1, 2)); break;
							case '3DObject': response.write(Buffer.alloc(1, 3)); break;
						}

						const dv = new DataView(new ArrayBuffer(2));
						dv.setUint16(0, res3[0].len, false);
						response.write(Buffer.from(new Uint8Array(dv.buffer)), 'binary');
						response.write(res3[0].xml, 'binary');
						response.write(res3[0].dat, 'binary');
						break;
					}
				}
				break;

			case 2: {	// binary data
				const res3 = await conn.query(`select data from t_binary_data where id = ?`, asset[0].id);
				if (res3.length !== 1) {
					throw new NotFoundError(`Couldn't find the requested resource. asset id: ${asset[0].id}`);
				}

				response.writeHead(200);
				response.write(res3[0].data, 'binary');
				break;
			}
			case 3: {	// xr scene template
				const res3 = await conn.query(`select data from t_template where id = ?`, asset[0].id);
				if (res3.length !== 1) {
					throw new NotFoundError(`Couldn't find the requested template. asset id: ${asset[0].id}`);
				}

				response.writeHead(200);
				response.write(res3[0].data, 'binary');
				break;
			}
			default:
				throw new InternalServerError(`The requested asset has invalid type information. asset: ${util.inspect(asset[0], true, 2, true)}`);
		}

		conn.release();

	} catch (err) {
		if (conn) {
			conn.release();
		}

		// conn error (500), res1 error (500), Not found (404), res2 error (500), Not found (404), res3 error (500), 
		// No general feature (412), Not a file (412)
		return next(err);
	}

	response.end();
});

module.exports = router;