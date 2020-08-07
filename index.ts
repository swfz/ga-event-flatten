import 'process';
import {analyticsreporting_v4, google} from 'googleapis';
import moment from 'moment';
import * as fs from "fs";
import Params$Resource$Reports$Batchget = analyticsreporting_v4.Params$Resource$Reports$Batchget;
import * as process from "process";
import { OAuth2Client, JWT, Compute, UserRefreshClient, GaxiosPromise, GoogleConfigurable, MethodOptions, StreamMethodOptions, GlobalOptions, GoogleAuth, BodyResponseCallback, APIRequestContext } from 'googleapis-common';
import Schema$ReportRequest = analyticsreporting_v4.Schema$ReportRequest;
import Schema$DateRange = analyticsreporting_v4.Schema$DateRange;
import Schema$GetReportsResponse = analyticsreporting_v4.Schema$GetReportsResponse;

enum KeyDimension {
  date,
  pagePath,
}
enum PvDimension {
  date,
  pagePath,
  pageTitle,
  yearWeek
}
enum EventDimension {
  date,
  pagePath,
  pageTitle,
  yearWeek,
  eventCategory,
  eventAction,
  eventLabel
}

enum PvMetrics {
  pageViews,
  sessions,
  adsenseAdsViewed,
  adsenseAdsClicks,
  adsenseRevenue
}
enum EventMetrics {
  totalEvents,
  eventValue
}

const dimension = {...KeyDimension, ...PvDimension, ...EventDimension};
type Dimension = typeof dimension;
const metrics = {...PvMetrics, ...EventMetrics};
type Metrics = typeof metrics;
type GaKey = Dimension|Metrics;

const analyticsreporting = google.analyticsreporting('v4');

const request = async (authClient: any, range: Schema$DateRange, metrics: string[], dimensions: string[]) => {
  const viewId: string = process.argv[2];
  const reportRequest: Schema$ReportRequest = {
    viewId: viewId,
    dateRanges: [range],
    metrics: metrics.map((m) => ({expression: m})),
    dimensions: dimensions.map((d) => ({name: d})),
    pageSize: 5000
  };
  const eventTrackPayload: Params$Resource$Reports$Batchget = {
    auth: authClient,
    requestBody: {
      reportRequests: [reportRequest]
    }
  };
  return await analyticsreporting.reports.batchGet(eventTrackPayload);
}

const formatEventField = (row: any): string => {
  const onlyCategoryKeys = [
    'ExternalLink',
    'Read'
  ];

  const formatActions = ['scroll'];

  const action = formatActions.includes(row.dimensions[EventDimension.eventCategory]) ?
    row.dimensions[EventDimension.eventAction].replace('%', 'p') :
    row.dimensions[EventDimension.eventAction];

  return onlyCategoryKeys.includes(row.dimensions[EventDimension.eventCategory]) ?
    row.dimensions[EventDimension.eventCategory] :
    `${row.dimensions[EventDimension.eventCategory]}_${action}`;
}

const uniqKeyPair = (row: any) => {
  const date = row.dimensions[KeyDimension.date];
  const path = row.dimensions[KeyDimension.pagePath].replace(/\?.*/,'');

  return {date, path}
}

const toStringKeys = (enumObject: any): string[] => {
  return Object.keys(enumObject).filter(v => isNaN(Number(v)) === false).map((k: string) => enumObject[k]);
}
const toGaKeys = (enumObject: any): string[] => {
  return toStringKeys(enumObject).map(k => `ga:${k}`);
}
( async () => {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/analytics.readonly']
  });
  const authClient = await auth.getClient();

  const startDate = process.argv[3] ? process.argv[3] : moment().add(-8, 'days').format('YYYY-MM-DD');
  const endDate = process.argv[4] ? process.argv[4] : moment().add(-1, 'days').format('YYYY-MM-DD');
  const last7DaysRange = {startDate, endDate};

  const eventRes = await request(authClient, last7DaysRange, [
    ...toGaKeys(EventMetrics)
],[
    ...toGaKeys(EventDimension)
  ]);

  const pvRes = await request(authClient, last7DaysRange, [
    ...toGaKeys(PvMetrics)
  ],[
    ...toGaKeys(PvDimension)
  ]);

  fs.writeFileSync('result-event.json', JSON.stringify(eventRes.data));
  fs.writeFileSync('result-pv.json', JSON.stringify(pvRes.data));

  const reportData = (response: any): any => {
    if (response && response.data && response.data.reports && response.data.reports[0] && response.data.reports[0].data && response.data.reports[0].data.rows) {
      return response.data.reports[0].data.rows;
    }
    else {
      return [];
    }
  }

  const eventRows = new Map();
  reportData(eventRes).forEach((r: any) => {
    const keyPair = uniqKeyPair(r);

    const key = `${keyPair.date}_${keyPair.path}`;
    const rowsByKey = eventRows.get(key);
    if ( rowsByKey ){
      rowsByKey.push(r);
      eventRows.set(key, rowsByKey);
    }
    else {
      eventRows.set(key, [r]);
    }
  });

  const calced = new Map();

  reportData(pvRes).forEach((r: any) => {
    const keyPair = uniqKeyPair(r);
    const key = `${keyPair.date}_${keyPair.path}`;

    let row = calced.get(key);
    if ( row ) {
      toStringKeys(PvMetrics).forEach((m: any) => {
        const value = r.metrics[PvMetrics[m]] ? r.metrics[PvMetrics[m]].values[0] : 0;
        row[m] += parseInt(value);
      });
    }
    else {
      row = {...keyPair,...{
          pageTitle: r.dimensions[PvDimension.pageTitle],
          yearWeek: r.dimensions[PvDimension.yearWeek],
        }
      };
      toStringKeys(PvMetrics).forEach((m: any) => {
        const value = r.metrics[PvMetrics[m]] ? r.metrics[PvMetrics[m]].values[0] : 0;
        row[m] = parseInt(value);
      });
    }

    const events = eventRows.get(key);
    if ( events ) {
      events.forEach((e: any) => {
        const eventKey = formatEventField(e);

        if (row[eventKey] === undefined) {
          row[eventKey] = parseInt(e.metrics[EventMetrics.totalEvents].values[0]);
        }
        else {
          row[eventKey] += parseInt(e.metrics[EventMetrics.totalEvents].values[0]);
        }
      });
    }
    calced.set(key, row);
  });

  console.log(calced.values());
  const byDate = Array.from(calced.values()).reduce((acc, cur) => {
    acc[cur.date] = (acc[cur.date] === undefined) ? [] : acc[cur.date];
    acc[cur.date].push(cur);
    return acc;
  }, {});

  Object.keys(byDate).forEach(date => {
    fs.writeFileSync(`results/result-${date}.json`, JSON.stringify(byDate[date]));
  });
})();


