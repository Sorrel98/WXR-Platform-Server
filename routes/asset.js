var express = require('express');

// get DBpool module
var dbPool = require('../DBpool').dbPool;

var router = express.Router();

router.get('/assetInfo', function(request, response){ 
    let uid = request.session.uid;
    let id = null;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    if(request.query.id) {
        id = parseInt(request.query.id);
        if(isNaN(id)) {
            response.writeHead(400);
            response.end();
            return;
        }
    }
    dbPool.getConnection((error, conn)=>{
        if(!error) {
            conn.query("select * from t_asset_item where parent_dir " + (id ? "= " + id : "is NULL") + " and (owner_id is NULL or owner_id = ?)", uid, (err1, result1)=>{
                if(!err1) {
                    let bottomUpSearch = (pathArr)=>{
                        let assetId = pathArr[0].id;
                        if(!assetId) {
                            pathArr[0].name = 'assets';
                            if(pathArr.length === 1)
                                pathArr[0].name += 'du';
                            let curItemName = pathArr[pathArr.length - 1].name;
                            let isPrivate = false;
                            let assetType = curItemName[curItemName.length - 2];
                            if(curItemName[curItemName.length - 1] === 'r')
                                isPrivate = true;
                            pathArr[pathArr.length - 1].name = curItemName.slice(0, -2);
                            let prom1 = new Promise((resolve, reject) => {
                                if(id) {
                                    conn.query("select id, name, email from t_user as u join t_asset_share as ash on u.id = ash.uid where ash.as_id = ?", id, (err3, result3)=>{
                                        if(!err3) {
                                            resolve(result3);
                                        }
                                        else {
                                            reject(err3);
                                        }
                                    });
                                }
                                else {
                                    resolve([]);
                                }
                            });
                            let prom2 = new Promise((resolve, reject)=>{
                                switch(assetType) {
                                case 'd':
                                    resolve(null);
                                    break;
                                case 't':
                                    //feature meta data array
                                    conn.query("select 'vuforia_feature' as feature_type, type, hex(left(dat, 4)) as signature from t_vuforia_feature where id = ? union all select 'general_feature' as feature_type, type, hex(left(bin, 4)) as signature from t_general_feature where id = ?", [id, id], (err3, result3)=>{
                                        if(!err3) {
                                            resolve(result3);
                                        }
                                        else {
                                            reject(err3);
                                        }
                                    });
                                    break;
                                case 'b':
                                    //binary data size
                                    conn.query("select length(data) as size, hex(left(data, 4)) as signature from t_binary_data where id = ?", id, (err3, result3)=>{
                                        if(!err3) {
                                            if(result3.length === 1)
                                                resolve(result3[0]);
                                            else
                                                resolve(null);
                                        }
                                        else {
                                            reject(err3);
                                        }
                                    });
                                    break;
								case 'c':
									//content source
									conn.query("select data from t_template where id = ?", id, (err3, result3)=>{
										if(!err3) {
											if(result3.length === 1)
												resolve(result3[0]);
											else
												resolve(null);
										}
										else {
											reject(err3);
										}
									});
									break;
								}
                            });
                            Promise.allSettled([prom1, prom2]).then((results)=>{
                                let errAny = false;
                                let toResp = {'pathArr' : pathArr, 'children' : result1, 'isPrivate' : isPrivate, 'assetType' : assetType};
                                if(results[0].status === 'fulfilled')
                                    toResp.shareTo = results[0].value;
                                else
                                    errAny = true;
                                if(results[1].status === 'fulfilled')
                                    toResp.metaData = results[1].value;
                                else
                                    errAny = true;
                                if(!errAny) {
                                    response.status(200).json(toResp);
                                }
                                else {
                                    response.writeHead(500);
                                    response.end('DB query Error');
                                    console.log(results[0].reason);
                                    console.log(results[1].reason);
                                }
                                conn.release();
                            });
                            return;
                        }
                        conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?)", [assetId, uid], (err2, result2)=>{
                            if(!err2) {
                                if(result2.length === 1) {
                                    if(pathArr.length === 1) {
                                        let types = ['d', 't', 'b', 'c'];
                                        result2[0].name += types[result2[0].item_type];
                                        if(result2[0].owner_id)
                                            result2[0].name += 'r';
                                        else
                                            result2[0].name += 'u';
                                    }
                                    pathArr[0].name = result2[0].name;
                                    pathArr.unshift({'id':result2[0].parent_dir, 'name':null});
                                    bottomUpSearch(pathArr);
                                }
                                else {
                                    response.writeHead(404);
                                    response.end();
                                    conn.release();
                                }
                            }
                            else {
                                response.writeHead(500);
                                response.end('DB query error');
                                console.log(err2);
                                conn.release();
                            }
                        });
                    };
                    bottomUpSearch([{'id':id, 'name':null}]);
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                    conn.release();
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

router.post('/makeDirectory', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let parentId = parseInt(request.body.parentId);
	let astName = request.body.astName;
	if(isNaN(parentId) || !astName) {
		response.writeHead(400);
		response.end();
		return;
	}
	dbPool.getConnection((error, conn)=>{
        if(!error) {
            conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 0", [parentId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1.length === 1) {
                        conn.query("insert into t_asset_item(name, parent_dir, owner_id, item_type) values(?, ?, ?, 0)", [astName, parentId, result1[0].owner_id], (err2, result2)=>{
							if(!err2) {
								response.status(200).json({'id':result2.insertId, 'name':astName, 'parent_dir':parentId, 'owner_id':result1[0].owner_id, 'item_type':0});
							}
							else {
								if(err2.errno === 1169) {
									response.writeHead(412);
									response.end('duplicated name');
								}
								else {
									response.writeHead(500);
									response.end('DB query error');
									console.log(err2);
								}
							}
							conn.release();
						});
                    }
                    else {
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized directory');
                        conn.release();
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                    conn.release();
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

router.post('/makeBinaryFromURI', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let parentId = parseInt(request.body.parentId);
	let astName = request.body.astName;
	let srcURI = request.body.srcURI;
	if(isNaN(parentId) || !astName || !srcURI) {
		response.writeHead(400);
		response.end();
		return;
	}
	dbPool.getConnection((error, conn)=>{
		if(!error) {
			conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 0", [parentId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1.length === 1) {
						conn.beginTransaction((trErr)=>{
							if(!trErr) {
								conn.query("insert into t_asset_item(name, parent_dir, owner_id, item_type) values(?, ?, ?, 2)", [astName, parentId, result1[0].owner_id], (err2, result2)=>{
									if(!err2) {
										if(srcURI.startsWith('http')) {
											let httpCl = http;
											if(srcURI.startsWith('https'))
												httpCl = https;
											httpCl.get(srcURI, (res)=>{
											   if(res.statusCode !== 200) {
												   res.resume();
												   console.log('Response status err');
												   return;
											   }
											   conn.query("insert into t_binary_data(id, data) values(?, ?)", [result2.insertId, res], (err3, result3)=>{
												   if(!err3) {
													   response.status(200).json({'id':result2.insertId, 'name':astName, 'parent_dir':parentId, 'owner_id':result1[0].owner_id, 'item_type':2});
													   conn.commit();
												   }
												   else {
													   response.writeHead(500);
													   response.end('DB query error');
													   console.log(err3);
													   conn.rollback();
													   console.log('QueryError');
												   }
												   conn.release();
											   });
											}).on('error', ()=>{
												conn.rollback();
												conn.release();
												console.log('RequestError');
											});
										}
									}
									else {
										if(err2.errno === 1169) {
											response.writeHead(412);
											response.end('Duplicated name');
										}
										else {
											response.writeHead(500);
											response.end('DB query error');
											console.log(err2);
										}
										conn.release();
									}
								});
							}
							else {
								response.writeHead(500);
								response.end('DB Transaction error');
								console.log(trErr);
								conn.release();
							}
						});                        
                    }
                    else {
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized directory');
                        conn.release();
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                    conn.release();
                }
            });
		}
		else {
			response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
		}
	});
});

router.post('/makeBinaryFromUpload', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let parentId;
	let astName;
	let form = new multiparty.Form();
	form.on('field', (name, value)=>{
		if(name === 'parentId') {
			parentId = parseInt(value);
		}
		else if(name === 'astName') {
			astName = value;
		}
	});
	form.on('part', (partDataStream)=>{
		if(partDataStream.name !== 'src') {
			partDataStream.resume();
			return;
		}
		if(isNaN(parentId) || !astName) {
			partDataStream.resume();
			response.writeHead(400);
			response.end();
			return;
		}
		dbPool.getConnection((error, conn)=>{
			if(!error) {
				conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 0", [parentId, uid], (err1, result1)=>{
					if(!err1) {
						if(result1.length === 1) {
							conn.beginTransaction((trErr)=>{
								if(!trErr) {
									conn.query("insert into t_asset_item(name, parent_dir, owner_id, item_type) values(?, ?, ?, 2)", [astName, parentId, result1[0].owner_id], (err2, result2)=>{
										if(!err2) {
											conn.query("insert into t_binary_data(id, data) values(?, ?)", [result2.insertId, partDataStream], (err3, result3)=>{
											   if(!err3) {
												   response.status(200).json({'id':result2.insertId, 'name':astName, 'parent_dir':parentId, 'owner_id':result1[0].owner_id, 'item_type':2});
												   conn.commit();
											   }
											   else {
												   response.writeHead(500);
												   response.end('DB query error');
												   console.log(err3);
												   conn.rollback();
												   console.log('QueryError');
											   }
											   conn.release();
										   });
										}
										else {
											if(err2.errno === 1169) {
												response.writeHead(412);
												response.end('Duplicated name');
											}
											else {
												response.writeHead(500);
												response.end('DB query error');
												console.log(err2);
											}
											conn.release();
										}
									});
								}
								else {
									response.writeHead(500);
									response.end('DB Transaction error');
									console.log(trErr);
									conn.release();
								}
							});                        
						}
						else {
							response.writeHead(412);
							response.end('Nonexistent or unauthorized directory');
							conn.release();
						}
					}
					else {
						response.writeHead(500);
						response.end('DB query error');
						console.log(err1);
						conn.release();
					}
				});
			}
			else {
				response.writeHead(500);
				response.end('Fail to connect DB');
				console.log(error);
			}
		});
	});
	form.parse(request);
});

//Create an abstract target
router.post('/makeTarget', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let parentId = parseInt(request.body.parentId);
	let astName = request.body.astName;
	if(isNaN(parentId) || !astName) {
		response.writeHead(400);
		response.end();
		return;
	}
	dbPool.getConnection((error, conn)=>{
        if(!error) {
            conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 0", [parentId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1.length === 1) {
                        conn.query("insert into t_asset_item(name, parent_dir, owner_id, item_type) values(?, ?, ?, 1)", [astName, parentId, result1[0].owner_id], (err2, result2)=>{
							if(!err2) {
								response.status(200).json({'id':result2.insertId, 'name':astName, 'parent_dir':parentId, 'owner_id':result1[0].owner_id, 'item_type':1});
							}
							else {
								if(err2.errno === 1169) {
									response.writeHead(412);
									response.end('Duplicated name');
								}
								else {
									response.writeHead(500);
									response.end('DB query error');
									console.log(err2);
								}
							}
							conn.release();
						});
                    }
                    else {
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized directory');
                        conn.release();
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                    conn.release();
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

//Currently only supports 2d images
router.post('/makeTargetGeneralFeature', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let targetId;
	let width;
	let form = new multiparty.Form();
	form.on('field', (name, value)=>{
		if(name === 'targetId') {
			targetId = parseInt(value);
		}
		else if(name === 'width') {
			width = parseFloat(value);
		}
	});
	form.on('part', (partDataStream)=>{
		if(partDataStream.name !== 'src') {
			partDataStream.resume();
			return;
		}
		if(isNaN(targetId) || isNaN(width)) {
			partDataStream.resume();
			response.writeHead(400);
			response.end();
			return;
		}
		dbPool.getConnection((error, conn)=>{
			if(!error) {
				conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 1", [targetId, uid], (err1, result1)=>{
					if(!err1) {
						if(result1.length === 1) {
							conn.beginTransaction((trErr)=>{
								if(!trErr) {
									conn.query("delete from t_general_feature where id = ?", targetId, (err2, result2)=>{
										if(!err2) {
											conn.query("insert into t_general_feature(id, type, width, bin) values(?, '2d', ?, ?)", [targetId, width, partDataStream], (err3, result3)=>{
												if(!err3) {
													conn.commit();
													conn.query("select type, hex(left(bin, 4)) as signature from t_general_feature where id = ?", targetId, (err4, result4)=>{
														if(!err4 && result4.length === 1) {
															response.status(200).json(result4[0]);
														}
														else {
															response.writeHead(200);
															response.end();
															console.log(err4);
														}
														conn.release();
													});
												}
												else {
													response.writeHead(500);
													response.end('DB query error');
													console.log(err3);
													conn.rollback();
													conn.release();
												}
											});
										}
										else {
											response.writeHead(500);
											response.end('DB query Error');
											console.log(err2);
											conn.release();
										}
									});
								}
								else {
									response.writeHead(500);
									response.end('DB Transaction error');
									console.log(trErr);
									conn.release();
								}
							});
						}
						else {
							response.writeHead(412);
							response.end('Nonexistent or unauthorized target');
							conn.release();
						}
					}
					else {
						response.writeHead(500);
						response.end('DB query error');
						console.log(err1);
						conn.release();
					}
				});
			}
			else {
				response.writeHead(500);
				response.end('Fail to connect DB');
				console.log(error);
			}
		});
	});
	form.parse(request);
});

router.post('/makeTargetVuforiaFeature', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let targetId;
	let type;
	let xmlStream;
	let form = new multiparty.Form();
	form.on('field', (name, value)=>{
		if(name === 'targetId') {
			targetId = parseInt(value);
		}
		else if(name === 'type') {
			type = value;
		}
	});
	form.on('part', (partDataStream)=> {
		if(partDataStream.name === 'xml') {
			xmlStream = partDataStream;
		}
		else if(partDataStream.name === 'dat'){
			if(isNaN(targetId) || !type || !xmlStream) {
				partDataStream.resume();
				response.writeHead(400);
				response.end();
				return;
			}
			dbPool.getConnection((error, conn)=>{
				if(!error) {
					conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 1", [targetId, uid], (err1, result1)=>{
						if(!err1) {
							if(result1.length === 1) {
								conn.beginTransaction((trErr)=>{
									if(!trErr) {
										conn.query("delete from t_vuforia_feature where id = ?", targetId, (err2, result2)=>{
											if(!err2) {
												conn.query("insert into t_vuforia_feature(id, type, xml, dat) values(?, ?, ?, ?)", [targetId, type, xmlStream, partDataStream], (err3, result3)=>{
													if(!err3) {
														conn.commit();
														conn.query("select type, hex(left(dat,4)) as signature from t_vuforia_feature where id = ?", targetId, (err4, result4)=>{
															if(!err4 || result4.length === 1) {
																response.status(200).json(result4[0]);
															}
															else {
																response.writeHead(200);
																response.end();
																console.log(err4);
															}
															conn.release();
														});
													}
													else {
														response.writeHead(500);
														response.end('DB query Error');
														console.log(err3);
														conn.rollback();
														conn.release();
													}
												});
											}
											else {
												response.writeHead(500);
												response.end('DB query Error');
												console.log(err2);
												conn.release();
											}
										});
									}
									else {
										response.writeHead(500);
										response.end('DB Transaction error');
										console.log(trErr);
										conn.release();
									}
								});
							}
							else {
								response.writeHead(412);
								response.end('Nonexistent or unauthorized target');
								conn.release();
							}
						}
						else {
							response.writeHead(500);
							response.end('DB query error');
							console.log(err1);
							conn.release();
						}
					});
				}
				else {
					response.writeHead(500);
					response.end('Fail to connect DB');
					console.log(error);
				}
			});
		}
		else {
			response.writeHead(400);
			response.end();
		}
	});
	form.parse(request);
});

router.post('/makeTemplate', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let parentId = parseInt(request.body.parentId);
	let astName = request.body.astName;
	if(isNaN(parentId) || !astName) {
		response.writeHead(400);
		response.end();
		return;
	}
	dbPool.getConnection((error, conn)=>{
        if(!error) {
            conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 0", [parentId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1.length === 1) {
						conn.beginTransaction((trErr)=>{
							if(!trErr) {
								conn.query("insert into t_asset_item(name, parent_dir, owner_id, item_type) values(?, ?, ?, 3)", [astName, parentId, result1[0].owner_id], (err2, result2)=>{
									if(!err2) {
										conn.query("insert into t_template(id, data, verified) values(?, '', b'0')", result2.insertId, (err3, result3)=>{
											if(!err3) {
												conn.commit();
												response.status(200).json({'id':result2.insertId, 'name':astName, 'parent_dir':parentId, 'owner_id':result1[0].owner_id, 'item_type':3});
											}
											else {
												conn.rollback();
												response.writeHead(500);
												response.end('DB query error');
												console.log(err3);
											}
											conn.release();
										});
									}
									else {
										if(err2.errno === 1169) {
											response.writeHead(412);
											response.end('Duplicated name');
										}
										else {
											response.writeHead(500);
											response.end('DB query error');
											console.log(err2);
										}
										conn.rollback();
										conn.release();
									}
								});
							}
							else {
								response.writeHead(500);
								response.end('DB Transaction error');
								console.log(trErr);
								conn.release();
							}
						});
                    }
                    else {
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized directory');
                        conn.release();
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                    conn.release();
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

router.post('/commitContent', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let astId = parseInt(request.body.astId);
	if(isNaN(astId)) {
		response.writeHead(400);
		response.end();
		return;
	}
	let contentSource = request.body.source;
	contentSource = contentSource.replace(/'/g, '"');
	//todo : Check content source validation
	dbPool.getConnection((error, conn)=>{
		if(!error) {
			conn.query("update t_template set data = ?, verified = b'1' where id = ?", [contentSource, astId], (err1, result1)=>{
				if(!err1) {
					response.writeHead(200);
					response.end();
				}
				else {
					response.writeHead(500);
					response.end('DB query error');
					console.log(err1);
				}
				conn.release();
			});
		}
		else {
			response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
		}
	});
});

router.post('/removeAsset', function(request, response){
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let astId = request.body.astId;
    if(!astId) 
    {   response.writeHead(400);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("delete from t_asset_item where id = ? and parent_dir is not null and (owner_id is null or owner_id = ?)", [astId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1.affectedRows !== 0) {
                        response.writeHead(200);
                        response.end();
                    }
                    else {
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized asset');
                    }
                    conn.release();
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                    conn.release();
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

router.post('/renameAsset', function(request, response){
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let astId = request.body.astId;
    let astName = request.body.astName;
    if(!astId || !astName) {
        response.writeHead(400);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("update t_asset_item set name = ? where id = ? and parent_dir is not null and (owner_id is null or owner_id = ?)", [astName, astId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1.affectedRows !== 0) {
                        response.writeHead(200);
                        response.end();
                    }
                    else {
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized asset');
                    }
                    conn.release();
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                    conn.release();
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

router.post('/shareAsset', function(request, response){
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let astId = request.body.astId;
    let targets = request.body.targets;
    if(!astId || !targets) {
        response.writeHead(400);
        response.end();
        return;
    }
    if(typeof targets === 'string') {
        targets = [targets];
    }
    if(!(targets instanceof Array)) {
        response.writeHead(400);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select count(*) as canShare from t_asset_item where id = ? and owner_id = ?", [astId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1[0].canShare === 1) {
                        let proms = [];
                        for(let target of targets) {
                            proms.push(new Promise((resolve, reject)=>{
                                if(typeof target !== 'string')
                                    reject('Nonexistent user');
                                let isEmail = target.indexOf('@') !== -1;
                                conn.query("select id, name, email from t_user where " + (isEmail ? "email" : "name") + " = ?", target, (err2, result2)=>{
                                    if(!err2) {
                                        if(result2.length === 1) {
                                            conn.query("insert into t_asset_share(as_id, uid) values(?, ?)", [astId, result2[0].id], (err3, result3)=>{
                                                if(!err3) {
                                                    resolve(result2[0]);
                                                }
                                                else {
                                                    if(err3.errno === 1169) {
                                                        reject('Already shared');
                                                    }
                                                    else {
                                                        reject('DB query error');
                                                        console.log(err3);
                                                    }
                                                }
                                            });
                                        }
                                        else {
                                            reject('Nonexistent user');
                                        }
                                    }
                                    else {
                                        reject('DB query error');
                                        console.log(err2);
                                    }
                                });
                            }));
                        }
                        Promise.allSettled(proms).then((results)=>{
                            conn.release();
                            let affectedPersons = [];
                            for(let r of results) {
                                if(r.status === 'fulfilled')
                                    affectedPersons.push(r.value);
                            }
                            response.status(200).json(affectedPersons);
                        });
                    }
                    else {
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized asset');
                        conn.release();
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                    conn.release();
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

router.post('/unshareAsset', function(request, response){
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let astId = request.body.astId;
    let targetId = request.body.targetId;
    if(!astId || !targetId) {
        response.writeHead(400);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select count(*) as canShare from t_asset_item where id = ? and owner_id = ?", [astId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1[0].canShare === 1) {
                        conn.query("delete from t_asset_share where as_id = ? and uid = ?", [astId, targetId], (err2, result2)=>{
                            if(!err2) {
                                if(result2.affectedRows === 1) {
                                    response.writeHead(200);
                                    response.end();
                                }
                                else {
                                    response.writeHead(412);
                                    response.end('Already unshared');
                                }
                            }
                            else {
                                response.writeHead(500);
                                response.end('DB query error');
                                console.log(err2);
                            }
                            conn.release();
                        });
                    }
                    else {
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized asset');
                        conn.release();
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                    conn.release();
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

router.get('/assetRawData', function(request, response) {
	let uid = request.session.uid;
	if(!uid) {
		response.writeHead(401);
		response.end();
		return;
	}
	let assetId = parseInt(request.query.assetId);
	let featureType = request.query.featureType;
	if(isNaN(assetId)) {
		response.writeHead(400);
		response.end();
		return;
	}
	dbPool.getConnection((error, conn)=> {
		if(!error) {
			let bottomUpAuthAndRead = (id, auth) => {
				if(id === null) {
					if(auth === 1) {
						conn.query("select name, item_type from t_asset_item where id = ?", assetId, (err2, result2)=>{
							if(!err2 && result2.length === 1) {
								switch(result2[0].item_type) {
								case 0:
									response.writeHead(412);
									response.end('It is directory');
									conn.release();
									break;
								case 1:
									if(featureType) {
										switch(featureType) {
										case 'general_feature':
											conn.query("select bin from t_general_feature where id = ?", assetId, (err3, result3)=>{
												if(!err3 && result3.length === 1) {
													response.setHeader('Content-disposition', 'filename=' + result2[0].name + '/genereal');
													response.end(result3[0].bin, 'binary');
												}
												else {
													response.writeHead(500);
													response.end('DB query error');
													console.log(err3);
												}
												conn.release();
											});
											break;
										case 'vuforia_feature':
											conn.query("select dat from t_vuforia_feature where id = ?", assetId, (err3, result3)=>{
												if(!err3 && result3.length === 1) {
													response.setHeader('Content-disposition', 'attachment; filename=' + result2[0].name + '/vuforia.dat');
													response.end(result3[0].dat, 'binary');
												}
												else {
													response.writeHead(500);
													response.end('DB query error');
													console.log(err3);
												}
												conn.release();
											});
											break;
										}
									}
									else {
										response.writeHead(400);
										response.end();
										conn.release();
									}
									break;
								case 2:
									conn.query("select data from t_binary_data where id = ?", assetId, (err3, result3)=>{
										if(!err3 && result3.length === 1) {
											response.setHeader('Content-disposition', 'attachment; filename=' + result2[0].name);
											response.end(result3[0].data, 'binary');
										}
										else {
											response.writeHead(500);
											response.end('DB query error');
											console.log(err3);
										}
										conn.release();
									});
									break;
								case 3:
									conn.query("select data from t_template where id = ?", assetId, (err3, result3)=>{
										if(!err3 && result3.length === 1) {
											response.setHeader('Content-disposition', 'attachment; filename=' + result2[0].name);
											response.end(result3[0].data, 'binary');
										}
										else {
											response.writeHead(500);
											response.end('DB query error');
											console.log(err3);
										}
										conn.release();
									});
									break;
								}
							}
							else {
								response.writeHead(500);
								response.end('DB query error');
								console.log(err2);
								conn.release();
							}
						});
					}
					else {
						response.writeHead(404);
						response.end();
						conn.release();
					}
					return;
				}
				conn.query("select parent_dir, (owner_id is null or owner_id = ? or (select count(*) from t_asset_share where as_id = id and uid = ?)) as auth from t_asset_item where id = ?", [uid, uid, id], (err1, result1)=> {
					if(!err1) {
						if(result1.length === 1) {
                            bottomUpAuthAndRead(result1[0].parent_dir, result1[0].auth | auth);
						}
						else {
							response.writeHead(404);
							response.end();
							conn.release();
						}
					}
					else {
						response.writeHead(500);
						response.end();
						console.log(err1);
						conn.release();
					}
				});
			};
			bottomUpAuthAndRead(assetId, 1);
		}
		else {
			response.writeHead(500);
			response.end('Fail to connect DB');
			console.log(error);
		}
	});
});

router.get('/assets/:path([^/]+(?:/[^/]+)*)', function(request, response) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let pathStr = request.params.path;
    // If it is target feature, A suffix such as /general or /vuforia is appended to the passed path
    let pathArr = pathStr.split('/');
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            //It is assumed that the home directory cannot be shared.
            conn.query("select id, (owner_id is null or owner_id = ?) as auth from t_asset_item where parent_dir is null and name = ?", [uid, pathArr[0]], (err1, result1)=>{
                if(!err1) {
                    if(result1.length === 1) {
                        let topdownSearch = (prevResult, depth) => {
                            if(depth === pathArr.length - 1 && prevResult[0].item_type) { //request target feature
								if(prevResult[0].auth === 1) {
									switch(pathArr[depth]) {
									case 'general':
										conn.query("select * from t_general_feature where id = ?", prevResult[0].id, (err3, result3)=>{
											if(!err3) {
												if(result3.length === 1) {
													response.writeHead(200);
													if(result3[0].type === '2d') {
														response.write(Buffer.alloc(1, 0));
													}
													else if(result3[0].type === '3d') {
														response.write(Buffer.alloc(1, 1));
													}
													else {
														response.write(Buffer.alloc(1, 255));
													}
													const dv = new DataView(new ArrayBuffer(4));
													dv.setFloat32(0, result3[0].width, false);
													response.write(Buffer.from(new Uint8Array(dv.buffer)), 'binary');
													dv.setFloat32(0, result3[0].height, false);
													response.write(Buffer.from(new Uint8Array(dv.buffer)), 'binary');
													dv.setFloat32(0, result3[0].depth, false);
													response.write(Buffer.from(new Uint8Array(dv.buffer)), 'binary');
													response.end(result3[0].bin, 'binary');
												}
												else {
													response.writeHead(412);
													response.end('The target has not general feature');
												}
											}
											else {
												response.writeHead(500);
												response.end('DB query error');
												console.log(err3);
											}
											conn.release();
										});
										break;
									case 'vuforia':
										//todo : unit test
										conn.query("select type, xml, length(xml) as len, dat from t_vuforia_feature where id = ?", prevResult[0].id, (err3, result3)=>{
											if(!err3) {
												if(result3.length === 1) {
													response.writeHead(200);
													switch(result3[0].type) {
													case 'SingleImage':
														response.write(Buffer.alloc(1, 0));
														break;
													case 'Cuboid':
														response.write(Buffer.alloc(1, 1));
														break;
													case 'Cylinder':
														response.write(Buffer.alloc(1, 2));
														break;
													case '3DObject':
														response.write(Buffer.alloc(1, 3));
														break;
													}
													const dv = new DataView(new ArrayBuffer(2));
													dv.setUint16(0, result3[0].len, false);
													response.write(Buffer.from(new Uint8Array(dv.buffer)), 'binary');
													response.write(result3[0].xml, 'binary');
													response.end(result3[0].dat, 'binary');
												}
												else {
													response.writeHead(412);
													response.end('The target has not general feature');
												}
											}
											else {
												response.writeHead(500);
												response.end('DB query error');
												console.log(err3);
											}
										});
										break;
									}
								}
								else {
									response.writeHead(404);
                                    response.end();
                                    conn.release();
								}
								return;
							}
							else if(depth === pathArr.length) {
                                if(prevResult[0].auth === 1) {
                                    if(prevResult[0].item_type === 2) {
										conn.query("select data from t_binary_data where id = ?", prevResult[0].id, (err3, result3)=>{
                                            if(!err3 && result3.length === 1) {
                                                response.writeHead(200);
                                                response.end(result3[0].data, 'binary');
                                            }
                                            else {
                                                response.writeHead(500);
                                                response.end('DB query error');
                                                console.log(err3);
                                            }
                                            conn.release();
                                        });
									}
									else if(prevResult[0].item_type === 3) {
										conn.query("select data from t_template where id = ?", prevResult[0].id, (err3, result3)=>{
											if(!err3 && result3.length === 1) {
                                                response.writeHead(200);
                                                response.end(result3[0].data, 'binary');
                                            }
                                            else {
                                                response.writeHead(500);
                                                response.end('DB query error');
                                                console.log(err3);
                                            }
                                            conn.release();
										});
									}
									else {
										response.writeHead(412);
                                        response.end('not file');
                                        conn.release();
									}
                                }
                                else {
                                    response.writeHead(404);
                                    response.end();
                                    conn.release();
                                }
                                return;
                            }

                            let name = pathArr[depth];
                            let parentId = prevResult[0].id;
                            conn.query("select id, (owner_id is null or owner_id = ? or (select count(*) from t_asset_share where as_id = id and uid = ?)) as auth, item_type from t_asset_item where parent_dir = ? and name = ?", [uid, uid, parentId, name], (err2, result2)=>{
                                if(!err2) {
                                    if(result2.length === 1) {
                                        result2[0].auth |= prevResult[0].auth;
                                        topdownSearch(result2, depth + 1);
                                    }
                                    else {
                                        response.writeHead(404);
                                        response.end();
                                        conn.release();
                                    }
                                }
                                else {
                                    response.writeHead(500);
                                    response.end();
                                    console.log(err2);
                                    conn.release();
                                }
                            });
                        };
                        topdownSearch(result1, 1);
                    }
                    else {
                        response.writeHead(404);
                        response.end();
                        conn.release();
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                    conn.release();
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

module.exports = router;