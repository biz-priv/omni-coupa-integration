'use strict';

const AWS = require('aws-sdk');
const axios = require('axios');
const { get } = require('lodash');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');

const cstDate = moment().tz('America/Chicago');
const { getConnectionToRds, prepareXML, makeApiRequest, putItem, getStatusCode } = require('../shared/cw-wt-invoices-to-coupa/helper');

const sns = new AWS.SNS();

const dynamoData = {};

module.exports.handler = async (event, context) => {
  console.info(JSON.stringify(event));
  const errors = [];

  try {
    const connections = await getConnectionToRds();

    const invoicesListFromHistoryTable = await getInvoicesFromHistoryTable(connections);

    const invoicesListFromMainTable = await getInvoicesFromMainTable(connections);

    const combinedList = [...invoicesListFromHistoryTable, ...invoicesListFromMainTable];
    const invoicesList = combinedList.filter((invoice, index, self) =>
      index === self.findIndex((t) => t.invoice_nbr === invoice.invoice_nbr)
    );

    console.info('invoicesList: ', invoicesList);

    for (const element of invoicesList) {
      const guid = uuidv4();
      dynamoData.Id = guid;

      dynamoData.CSTDate = cstDate.format('YYYY-MM-DD');
      dynamoData.CSTDateTime = cstDate.format('YYYY-MM-DD HH:mm:ss');

      const invoice = get(element, 'invoice_nbr');
      dynamoData.InvoiceNbr = invoice;

      dynamoData.SourceSystemType = 'WT';
      try {
        const invoiceDetails = await fetchInvoiceDetails(invoice, connections);
        // const housebill = get(invoiceDetails, '[0].housebill_nbr');
        // const gcCode = get(invoiceDetails, '[0].gc_code');
        let invoiceDate = get(invoiceDetails, '[0].invoice_date');
        const currency = get(invoiceDetails, '[0].currency');
        if (invoiceDate instanceof Date) {
          invoiceDate = invoiceDate.toISOString();
        }

        const totalSum = get(invoiceDetails, '[0].total_sum');
        const b64str = await callWtRestApi(invoice);

        const xmlTOCoupa = await prepareXML(guid, invoice, totalSum, b64str, invoiceDate, currency);
        dynamoData.XmlTOCoupa = xmlTOCoupa;

        const response = await makeApiRequest(guid, xmlTOCoupa);
        dynamoData.ResponseFromCoupa = response;

        console.info('response: ', response);

        const statusCodeAndMessage = await getStatusCode(response);
        if (get(statusCodeAndMessage, 'statusCode') === '200') {
          dynamoData.StatusCode = get(statusCodeAndMessage, 'statusCode');
          dynamoData.Message = get(statusCodeAndMessage, 'statusMessage');
          dynamoData.Status = 'SUCCESS';
        }else{
          dynamoData.StatusCode = get(statusCodeAndMessage, 'statusCode');
          dynamoData.Message = get(statusCodeAndMessage, 'statusMessage');
          dynamoData.Status = 'FAILED';
          throw new Error(`Invoice processing failed with status code: ${dynamoData.StatusCode} and message: ${dynamoData.Message}`);
        }

        await putItem(dynamoData);
      } catch (innerError) {
        console.error(`Error processing invoice ${get(element, 'invoice_nbr')}:`, innerError);
        errors.push(`Invoice ${get(element, 'invoice_nbr')}: ${innerError.message || innerError}`);
        console.info('Error has been added to the errors array');

        dynamoData.Status = 'FAILED';
        await putItem(dynamoData);
      }
    }

    if (errors.length > 0) {
      const params = {
        Message: `Errors occurred while processing invoices in function ${context.functionName}.\n\nERROR DETAILS:\n${errors.join('\n')}`,
        Subject: `Errors occurred in function ${context.functionName}`,
        TopicArn: process.env.ERROR_SNS_TOPIC_ARN,
      };
      await sns.publish(params).promise();
      console.info('SNS notification has been sent for all errors');
    }

    return 'success';
  } catch (e) {
    console.error(e);
    try {
      const params = {
        Message: `An error occurred in function ${context.functionName}.\n\nERROR DETAILS: ${e}.`,
        Subject: `An error occurred in function ${context.functionName}`,
        TopicArn: process.env.ERROR_SNS_TOPIC_ARN,
      };
      await sns.publish(params).promise();
      console.info('SNS notification has been sent');
    } catch (err) {
      console.error('Error while sending SNS notification: ', err);
    }
    return 'failed';
  }
};

async function getInvoicesFromHistoryTable(connections) {
  try {
    const today = moment().format('YYYY-MM-DD');
    let dbName;
    if (process.env.ENVIRONMENT === 'dev') {
      dbName = 'dw_uat.';
    } else {
      dbName = 'dw_prod.';
    }
    const tableName = `${dbName}interface_ar_his`;
    const query = `SELECT DISTINCT invoice_nbr
          FROM ${tableName} iah
          WHERE bill_to_custno = ${process.env.BILL_NUMBER}
          AND CAST(processed_date AS DATE) >= ${today}
          AND processed = 'P'`;

    // const query = `SELECT DISTINCT invoice_nbr
    //       FROM dw_prod.interface_ar_his iah
    //       WHERE customer_id = 'CLOUDFLARE'
    //         AND processed = 'P' limit 10`;

    // const query = `SELECT DISTINCT invoice_nbr
    //   FROM dw_prod.interface_ar_his iah where housebill_nbr = 'SFO3937231-00'`;

    console.info('query', query);
    const [rows] = await connections.execute(query);
    const result = rows;
    return result;
  } catch (error) {
    console.error('getInvoicesFromHistoryTable: no data found');
    throw error;
  }
}

async function getInvoicesFromMainTable(connections) {
  try {
    const today = moment().format('YYYY-MM-DD');
    let dbName;
    if (process.env.ENVIRONMENT === 'dev') {
      dbName = 'dw_uat.';
    } else {
      dbName = 'dw_prod.';
    }
    const tableName = `${dbName}interface_ar`;
    const query = `SELECT DISTINCT invoice_nbr
          FROM ${tableName} ia
          WHERE bill_to_custno = ${process.env.BILL_NUMBER}
          AND CAST(processed_date AS DATE) >= ${today}
          AND processed = 'P'`;

    // const query = `SELECT DISTINCT invoice_nbr
    //       FROM dw_prod.interface_ar_his iah
    //       WHERE customer_id = 'CLOUDFLARE'
    //         AND processed = 'P' limit 10`;

    // const query = `SELECT DISTINCT invoice_nbr
    //   FROM dw_prod.interface_ar_his iah where housebill_nbr = 'SFO3937231-00'`;

    console.info('query', query);
    const [rows] = await connections.execute(query);
    const result = rows;
    return result;
  } catch (error) {
    console.error('getInvoicesFromMainTable: no data found');
    throw error;
  }
}


async function fetchInvoiceDetails(invoice, connections) {
  try {
    const query = `SELECT invoice_date,currency,SUM(total) as total_sum from dw_prod.interface_ar_his iah where invoice_nbr = '${invoice}';`;
    console.info('query', query);
    const [rows] = await connections.execute(query);
    const result = rows;
    return result;
  } catch (error) {
    console.error('fetchInvoiceDetails: no data found');
    throw error;
  }
}

async function callWtRestApi(invoice) {
  try {
    const url = `${process.env.WEBSLI_URL}/${process.env.WEBSLI_TOKEN}/housebill=${invoice}/doctype=BI|acctno=${process.env.BILL_NUMBER}`;
    // const url = `https://websli.omnilogistics.com/wtProd/getwtdoc/v1/json/${process.env.WEBSLI_TOKEN}/housebill=${invoice}/doctype=BI|acctno=${process.env.BILL_NUMBER}`;
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
