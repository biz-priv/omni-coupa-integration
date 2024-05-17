'use strict';

const AWS = require('aws-sdk');
const axios = require('axios');
// const { get } = require('lodash');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const { getConnectionToRds, prepareXML, makeApiRequest } = require('./helper');

const sns = new AWS.SNS();

module.exports.handler = async (event, context) => {
  console.info(JSON.stringify(event));
  try {
    const connections = await getConnectionToRds();

    const invoicesList = await getInvoices(connections);

    console.info('invoicesList: ', invoicesList);

    for (const element of invoicesList) {
      const invoice = element.invoice_nbr;
      const totalAndGcCode = await getTotalAndGcCode(invoice, connections);
      const b64str = await callWtRestApi(totalAndGcCode[0].unique_ref_nbr, totalAndGcCode[0].gc_code);
      const guid = uuidv4();
      const xmlTOCoupa = await prepareXML(guid, invoice, totalAndGcCode[0].total_sum, b64str);
      const response = await makeApiRequest(guid, xmlTOCoupa);
      console.info('response: ', response);
    }
    return 'success';
  } catch (e) {
    console.error(e);
    try {
      const params = {
        Message: `An error occurred in function ${context.functionName}.\n\nERROR DETAILS: ${e}.`,
        Subject: `An error occured in function ${context.functionName}`,
        TopicArn: process.env.ERROR_SNS_TOPIC_ARN,
      };
      await sns.publish(params).promise();
      console.info('SNS notification has sent');
    } catch (err) {
      console.error('Error while sending sns notification: ', err);
    }
    return 'failed';
  }
};

async function getInvoices(connections) {
  try {
    const today = moment().format('YYYY-MM-DD');
    const query = `SELECT DISTINCT invoice_nbr
        FROM dw_prod.interface_ar_iah iah
        WHERE customer_id = 'CLOUUSSFO'
          AND processed_date = ${today}
          AND processed = 'P'`;

    console.info('query', query);
    const [rows] = await connections.execute(query);
    const result = rows;
    return result;
  } catch (error) {
    console.error('getInvoices: no data found');
    throw error;
  }
}

async function getTotalAndGcCode(invoice, connections) {
  try {
    const query = `SELECT gc_code,unique_ref_nbr,SUM(total) as total_sum from dw_prod.interface_ar_iah iah where invoice_nbr = '${invoice}';`;
    console.info('query', query);
    const [rows] = await connections.execute(query);
    const result = rows;
    return result;
  } catch (error) {
    console.error('getTotalAndGcCode: no data found');
    throw error;
  }
}

async function callWtRestApi(invoice, gcCode) {
  try {
    const url = `https://websli.omnilogistics.com/wtProd/getwtdoc/v1/json/f057a50ab56c95b124b09328abd5c9/invoice=${invoice}|company=${gcCode}/doctype=BI`;
    console.info(`url: ${url}`);

    const response = await axios.get(url);

    if (response.status === 200) {
      const data = response.data;
      const b64str = data.wtDocs.wtDoc[0].b64str;
      return b64str;
    }
  } catch (error) {
    console.error(`Error calling WT REST API for invoice ${invoice}: ${error}`);
    throw error;
  }
  return null;
}
