'use strict';

const AWS = require('aws-sdk');
const axios = require('axios');
const mysql = require('mysql2/promise');
const xml2js = require('xml2js');
const { get } = require('lodash');

const dynamoDb = new AWS.DynamoDB.DocumentClient();


async function getConnectionToRds() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });
    return connection;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function prepareXML(guid, filename, total, b64str, InvoiceDate, curr) {
  try {
    const builder = new xml2js.Builder({
      headless: true,
      renderOpts: { pretty: false, indent: '  ', newline: '\n' },
    });

    const xmlData = {
      cXML: {
        $: {
          version: '1.0',
          payloadID: '1240598937@SUBDOMAIN.coupahost.com',
          timestamp: '2024-04-23T14:44:51-08:00',
        },
        Header: {
          From: {
            Credential: {
              $: {
                domain: 'DUNS',
              },
              Identity: 'Omni',
            },
          },
          To: {
            Credential: {
              $: {
                domain: 'DUNS',
              },
              Identity: 'Cloudflare',
            },
          },
          Sender: {
            Credential: {
              $: {
                domain: 'DUNS',
              },
              Identity: 'Omni',
              SharedSecret: 'Coupa123',
            },
            UserAgent: 'Bizcloud v1',
          },
        },
        Request: {
          $: {
            deploymentMode: 'production',
          },
          InvoiceDetailRequest: {
            InvoiceDetailRequestHeader: {
              $: {
                invoiceID: filename,
                purpose: 'standard',
                operation: 'new',
                invoiceDate: InvoiceDate,
              },
              InvoiceDetailHeaderIndicator: '',
              InvoiceDetailLineIndicator: {
                $: {
                  isAccountingInLine: 'yes',
                },
              },
              InvoicePartner: [
                {
                  Contact: {
                    $: {
                      role: 'remitTo',
                      addressID: 'RTCode',
                    },
                    Name: {
                      _: 'OMNI LOGISTICS, LLC',
                      $: {
                        'xml:lang': 'en',
                      },
                    },
                    PostalAddress: {
                      $: {
                        name: 'default',
                      },
                      Street: ['MAIL CODE: 5237', 'P.O. BOX 660367'],
                      City: 'DALLAS',
                      State: 'TX',
                      PostalCode: '75266-0367',
                      Country: {
                        $: {
                          isoCountryCode: 'US',
                        },
                      },
                    },
                    Phone: {
                      $: {
                        name: 'work',
                      },
                      TelephoneNumber: {
                        CountryCode: {
                          _: '1',
                          $: {
                            isoCountryCode: 'US',
                          },
                        },
                        AreaOrCityCode: '281',
                        Number: '209-9228',
                      },
                    },
                  },
                },
                {
                  Contact: {
                    $: {
                      role: 'billTo',
                    },
                    Name: {
                      _: 'CLOUDFLARE US INC',
                      $: {
                        'xml:lang': 'en',
                      },
                    },
                    PostalAddress: {
                      $: {
                        name: 'default',
                      },
                      Street: '101 TOWNSEND ST',
                      City: 'SAN FRANCISCO',
                      State: 'CA',
                      PostalCode: '94107',
                      Country: {
                        $: {
                          isoCountryCode: 'US',
                        },
                      },
                    },
                  },
                },
              ],
              PaymentTerm: {
                $: {
                  payInNumberOfDays: '30',
                },
              },
              Comments: {
                Attachment: {
                  URL: `cid:${filename}.pdf`,
                },
              },
            },
            InvoiceDetailOrder: {
              InvoiceDetailOrderInfo: {
                MasterAgreementReference: {
                  DocumentReference: {
                    $: {
                      payloadID: '',
                    },
                  },
                },
              },
              InvoiceDetailItem: {
                $: {
                  invoiceLineNumber: '1',
                  quantity: '1',
                },
                UnitOfMeasure: 'EA',
                UnitPrice: {
                  Money: {
                    _: total,
                    $: {
                      currency: curr,
                    },
                  },
                },
                InvoiceDetailItemReference: {
                  $: {
                    lineNumber: '1',
                  },
                  Description: {
                    _: 'Equipment Shipping',
                    $: {
                      'xml:lang': 'en',
                    },
                  },
                },
                SubtotalAmount: {
                  Money: {
                    _: total,
                    $: {
                      currency: curr,
                    },
                  },
                },
              },
            },
            InvoiceDetailSummary: {
              SubtotalAmount: {
                Money: {
                  _: total,
                  $: {
                    currency: curr,
                  },
                },
              },
              Tax: {
                Money: {
                  $: {
                    currency: 'USD',
                  },
                },
                Description: {
                  $: {
                    'xml:lang': 'en-US',
                  },
                },
                TaxDetail: {
                  $: {
                    category: 'USD',
                  },
                  TaxableAmount: {
                    Money: {
                      $: {
                        currency: 'USD',
                      },
                    },
                  },
                  TaxAmount: {
                    Money: {
                      $: {
                        currency: 'USD',
                      },
                    },
                  },
                },
              },
              NetAmount: {
                Money: {
                  $: {
                    currency: 'USD',
                  },
                },
              },
            },
          },
        },
      },
    };

    const xmlPayload = builder.buildObject(xmlData);
    console.info('xmlPayload', xmlPayload);
    const payloadWithoutBase64 = `--${guid}\r\nContent-type: text/xml; charset=UTF-8\r\nContent-ID: <payload.xml>\r\n\r\n<?xml version="1.0" encoding="UTF-8"?>\r\n<!DOCTYPE cXML SYSTEM "http://xml.cXML.org/schemas/cXML/1.2.020/InvoiceDetail.dtd">\r\n${xmlPayload}\r\n--${guid}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Disposition: inline; filename=${filename}.pdf\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <${filename}.pdf>\r\n\r\n<base64>\r\n--${guid}--`;
    const finalPayload = `--${guid}\r\nContent-type: text/xml; charset=UTF-8\r\nContent-ID: <payload.xml>\r\n\r\n<?xml version="1.0" encoding="UTF-8"?>\r\n<!DOCTYPE cXML SYSTEM "http://xml.cXML.org/schemas/cXML/1.2.020/InvoiceDetail.dtd">\r\n${xmlPayload}\r\n--${guid}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Disposition: inline; filename=${filename}.pdf\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <${filename}.pdf>\r\n\r\n${b64str}\r\n--${guid}--`;
    return { finalPayload, payloadWithoutBase64 };
  } catch (error) {
    console.error('Error in getProductValues:', error);
    throw error;
  }
}

async function makeApiRequest(guid, payload) {
  try {
    const apiEndPoint = process.env.COUPA_API_URL;
    const apiHeaders = {
      'Content-Type': `multipart/related; boundary=${guid}; type=text/xml; start=<payload.xml>`,
    };
    const config = {
      url: apiEndPoint,
      headers: apiHeaders,
      data: payload,
      method: 'POST',
    };
    const response = await axios.request(config);

    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      console.error('Error in calling coupa API', error.response.data);
    } else {
      console.error('Error in calling coupa API', error.message);
    }
    throw error;
  }
}

async function putItem(item) {
  let params;
  try {
    params = {
      TableName: process.env.LOGS_TABLE,
      Item: item,
    };
    console.info('Insert Params: ', params);
    const dynamoInsert = await dynamoDb.put(params).promise();
    return dynamoInsert;
  } catch (error) {
    console.error('Put Item Error: ', error, '\nPut params: ', params);
    throw error;
  }
}

async function getStatusCode(response) {
  const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
  const responseObj = await parser.parseStringPromise(response);
  console.info('responseObj', responseObj);

  const statusCode = get(responseObj, 'cXML.Response.Status.code');
  const statusMessage = get(responseObj, 'cXML.Response.Status._');

  const result = {
    statusCode,
    statusMessage
  };

  return result;
}

module.exports = {
  getConnectionToRds,
  prepareXML,
  makeApiRequest,
  putItem,
  getStatusCode,
};
