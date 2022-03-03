const fsp = require('fs').promises;
const path = require('path');
const process = require('process');
const uuid = require('uuid');

const dbPool = require('../lib/DBpool').dbPool;

const field_name = 'path';
const dir_name = path.join(__dirname, '../binary_assets');
const query_file = 'export_query.sql';

(async function main() {
  let conn;
  try {

    conn = await dbPool.getConnection();

    // Add path column to the t_binary_data table
    const res1 = await conn.query(`describe t_binary_data`);
    if (res1.filter(col => col.Field === field_name).length === 0) {
      await conn.query(`alter table t_binary_data add ${field_name} tinytext`);
    }

    // Reset binary_assets directory, which stores binary data of assets.
    await fsp.rm(dir_name, { recursive: true, force: true });
    await fsp.mkdir(dir_name, { recursive: true });

    // Read a record from t_binary_data and write the binary data to the file system,
    // then update path column.
    const res2 = await conn.query(`select id from t_binary_data;`);
    const num_row = res2.length;
    console.log(`found ${num_row} binary assets.`);

    console.log(`generating query file: ${path.resolve(path.join(dir_name, query_file))}`);
    const fd = await fsp.open(path.join(dir_name, query_file), 'w');
    const abs_dir_path = path.resolve(dir_name);
    await fd.writeFile(`# usage: mysql < query.sql\n`);
    await fd.writeFile(`USE wxr_server;\n`);

    let update_case_stmt = '';
    for await (const record of res2) {
      const file_name = uuid.v4();
      await fd.writeFile(`select data into dumpfile '${path.join(abs_dir_path, file_name)}' from t_binary_data where id=${record.id};\n`);
      update_case_stmt += ` when id=${record.id} then '${file_name}'`;
    }
    update_case_stmt += ` end`;

    await fd.close();

    console.log(`updating ${field_name} column...`);
    await conn.query(`update t_binary_data set ${field_name}=(case${update_case_stmt})`);

  } catch (err) {
    if (conn) {
      conn.release();
    }

    console.log(err);
    process.exit();
  }

  console.log(`process is done.run the following command: 
  $ mysql < ${path.resolve(path.join(dir_name, query_file))}`);
  console.log(`exiting program.`)
  process.exit();
})();
