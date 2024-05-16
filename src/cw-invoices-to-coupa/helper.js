'use strict';

// const AWS = require('aws-sdk');
const axios = require('axios');
// const moment = require('moment');
const mysql = require('mysql2/promise');
const xml2js = require('xml2js');


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

async function prepareXML(guid, filename, total, b64str) {
    try {
        const builder = new xml2js.Builder({
            headless: true,
            renderOpts: { pretty: true, indent: '    ' },
        });

        const xmlData = {
            'cXML': {
                '$': {
                    'version': '1.0',
                    'payloadID': '1240598937@SUBDOMAIN.coupahost.com',
                    'timestamp': '2024-04-23T14:44:51-08:00'
                },
                'Header': {
                    'From': {
                        'Credential': {
                            '$': {
                                'domain': 'DUNS'
                            },
                            'Identity': 'Omni'
                        }
                    },
                    'To': {
                        'Credential': {
                            '$': {
                                'domain': 'DUNS'
                            },
                            'Identity': 'Cloudflare'
                        }
                    },
                    'Sender': {
                        'Credential': {
                            '$': {
                                'domain': 'DUNS'
                            },
                            'Identity': 'Omni',
                            'SharedSecret': 'Coupa123'
                        },
                        'UserAgent': 'Bizcloud v1'
                    }
                },
                'Request': {
                    '$': {
                        'deploymentMode': 'production'
                    },
                    'InvoiceDetailRequest': {
                        'InvoiceDetailRequestHeader': {
                            '$': {
                                'invoiceID': filename,
                                'purpose': 'standard',
                                'operation': 'new',
                                'invoiceDate': '2024-02-29T00:00:00-06:00'
                            },
                            'InvoiceDetailHeaderIndicator': '',
                            'InvoiceDetailLineIndicator': {
                                '$': {
                                    'isAccountingInLine': 'yes'
                                }
                            },
                            'InvoicePartner': [
                                {
                                    'Contact': {
                                        '$': {
                                            'role': 'remitTo',
                                            'addressID': 'RTCode'
                                        },
                                        'Name': {
                                            '_': 'OMNI LOGISTICS, LLC',
                                            '$': {
                                                'xml:lang': 'en'
                                            }
                                        },
                                        'PostalAddress': {
                                            '$': {
                                                'name': 'default'
                                            },
                                            'Street': [
                                                'MAIL CODE: 5237',
                                                'P.O. BOX 660367'
                                            ],
                                            'City': 'DALLAS',
                                            'State': 'TX',
                                            'PostalCode': '75266-0367',
                                            'Country': {
                                                '$': {
                                                    'isoCountryCode': 'US'
                                                }
                                            }
                                        },
                                        'Phone': {
                                            '$': {
                                                'name': 'work'
                                            },
                                            'TelephoneNumber': {
                                                'CountryCode': {
                                                    '_': '1',
                                                    '$': {
                                                        'isoCountryCode': 'US'
                                                    }
                                                },
                                                'AreaOrCityCode': '281',
                                                'Number': '209-9228'
                                            }
                                        }
                                    }
                                },
                                {
                                    'Contact': {
                                        '$': {
                                            'role': 'billTo'
                                        },
                                        'Name': {
                                            '_': 'CLOUDFLARE US INC',
                                            '$': {
                                                'xml:lang': 'en'
                                            }
                                        },
                                        'PostalAddress': {
                                            '$': {
                                                'name': 'default'
                                            },
                                            'Street': '101 TOWNSEND ST',
                                            'City': 'SAN FRANCISCO',
                                            'State': 'CA',
                                            'PostalCode': '94107',
                                            'Country': {
                                                '$': {
                                                    'isoCountryCode': 'US'
                                                }
                                            }
                                        }
                                    }
                                }
                            ],
                            'PaymentTerm': {
                                '$': {
                                    'payInNumberOfDays': '30'
                                }
                            },
                            'Comments': {
                                'Attachment': {
                                    'URL': `cid: ${filename}.pdf`
                                }
                            }                            
                        },
                        'InvoiceDetailOrder': {
                            'InvoiceDetailOrderInfo': {
                                'MasterAgreementReference': {
                                    'DocumentReference': {
                                        '$': {
                                            'payloadID': ''
                                        }
                                    }
                                }
                            },
                            'InvoiceDetailItem': {
                                '$': {
                                    'invoiceLineNumber': '1',
                                    'quantity': '1'
                                },
                                'UnitOfMeasure': 'EA',
                                'UnitPrice': {
                                    'Money': {
                                        '_': total,
                                        '$': {
                                            'currency': 'USD'
                                        }
                                    }
                                },
                                'InvoiceDetailItemReference': {
                                    '$': {
                                        'lineNumber': '1'
                                    },
                                    'Description': {
                                        '_': 'Equipment Shipping',
                                        '$': {
                                            'xml:lang': 'en'
                                        }
                                    }
                                },
                                'SubtotalAmount': {
                                    'Money': {
                                        '_': total,
                                        '$': {
                                            'currency': 'USD'
                                        }
                                    }
                                }
                            }
                        },
                        'InvoiceDetailSummary': {
                            'SubtotalAmount': {
                                'Money': {
                                    '_': total,
                                    '$': {
                                        'currency': 'USD'
                                    }
                                }
                            },
                            'Tax': {
                                'Money': {
                                    '$': {
                                        'currency': 'USD'
                                    }
                                },
                                'Description': {
                                    '$': {
                                        'xml:lang': 'en-US'
                                    }
                                },
                                'TaxDetail': {
                                    '$': {
                                        'category': 'USD'
                                    },
                                    'TaxableAmount': {
                                        'Money': {
                                            '$': {
                                                'currency': 'USD'
                                            }
                                        }
                                    },
                                    'TaxAmount': {
                                        'Money': {
                                            '$': {
                                                'currency': 'USD'
                                            }
                                        }
                                    }
                                }
                            },
                            'NetAmount': {
                                'Money': {
                                    '$': {
                                        'currency': 'USD'
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        const xmlPayload = builder.buildObject(xmlData);

        const finalPayload = `
        --${guid}
Content-type: text/xml; charset=UTF-8
Content-ID: <payload.xml>

${xmlPayload}
--${guid}
Content-Type: text/plain; charset=utf-8
Content-Disposition: inline; filename='${filename}.pdf'
Content-Transfer-Encoding: base64
Content-ID: <${filename}.pdf>

${b64str}
--${guid}--`

return finalPayload;
    } catch (error) {
        console.error('Error in getProductValues:', error);
        throw error;
    }
}

async function makeApiRequest(guid, payload) {
    try {
        const apiEndPoint = 'https://cloudflare-test.coupahost.com/cxml/invoices';
        const apiHeaders = {
            'Content-Type': `multipart/related; boundary=${guid}; type=text/xml; start=<payload.xml>`
        };
        const response = await axios.post(apiEndPoint, payload, { headers: apiHeaders });

        return response.data;

    }
    catch (error) {
        console.error('Error in calling coupa API', error);
        throw error;
    }
}

module.exports = {
    getConnectionToRds,
    prepareXML,
    makeApiRequest,
};