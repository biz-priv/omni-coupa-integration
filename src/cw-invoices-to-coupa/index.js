'use strict';

const axios = require('axios');
// const AWS = require('aws-sdk');
const { get } = require('lodash');
const { v4: uuidv4 } = require('uuid');
// const xml2js = require('xml2js');
const moment = require('moment');
const { getConnectionToRds, prepareXML, makeApiRequest } = require('./helper');

// const sns = new AWS.SNS();

let functionName;
module.exports.handler = async (event, context) => {
    console.info(JSON.stringify(event));
    try {
        functionName = get(context, 'functionName');
        console.info('functionName:', functionName);
        const connections = await getConnectionToRds();

        const invoicesList = await getInvoices(connections);

        for (let i = 0; i < invoicesList.length; i++) {
            const invoice = invoicesList[i].invoice;
            const [total, gcCode] = await getTotalAndGcCode(invoice,connections);
            const b64str = await callWtRestApi(invoice,gcCode);
            const guid = uuidv4()
            const filename = 'SSFO00895958';
            const xmlTOCoupa = await prepareXML(guid,filename,total,b64str);
            const response = await makeApiRequest(guid,xmlTOCoupa);
            console.info('response: ',response);
        }
        return 'success';
    } catch (e) {
        console.error(e);
        return 'failed';
    }
};

async function getInvoices(connections) {
    try {
        const today = moment().format('YYYY-MM-DD');
        const query = `SELECT DISTINCT invoice_nbr
        FROM dw_prod.interface_ar ia
        WHERE customer_id = 'CLOUUSSFO'
          AND processed_date = ${today}
          AND processed = 'P'`;

        console.info('query', query);
        const [rows] = await connections.execute(query);
        const result = rows;
        if (!result || result.length === 0) {
            throw new 'No data found.';
        }
        return result;
    } catch (error) {
        console.error('getInvoices: no data found');
        throw error;
    }
}

async function getTotalAndGcCode(invoive,connections) {
    try {
        const query = `SELECT gc_code,SUM(total) as total_sum from dw_uat.interface_ar ia where invoice_nbr = ${invoive};`;
        console.info('query', query);
        const result = await connections.execute(query);
        if (!result || result.length === 0) {
            throw new 'No data found.';
        }
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

