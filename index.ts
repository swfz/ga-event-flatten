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

// custom dimensionは複数指定すると結果が返ってこない

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

  const action = formatActions.includes(row.dimensions[3]) ? row.dimensions[4].replace('%', 'p') : row.dimensions[4];

  return onlyCategoryKeys.includes(row.dimensions[3]) ? row.dimensions[3] : `${row.dimensions[3]}_${action}`;
}

const uniqKeyPair = (row: any) => {
  const date = row.dimensions[1];
  const path = row.dimensions[2].replace(/\?.*/,'');

  return {date, path}
}

( async () => {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/analytics.readonly']
  });
  const authClient = await auth.getClient();

  const last7DaysRange = {
    startDate: moment().add(-8, 'days').format('YYYY-MM-DD'),
    endDate: moment().add(-1, 'days').format('YYYY-MM-DD')
  };

  const eventRes = await request(authClient, last7DaysRange, [
    'ga:totalEvents',
    'ga:eventValue'
  ],[
    'ga:pageTitle',
    'ga:date',
    'ga:pagePath',
    'ga:eventCategory',
    'ga:eventAction',
    'ga:eventLabel',
    'ga:socialNetwork',
    'ga:fullReferrer',
  ]);

  const pvRes = await request(authClient, last7DaysRange, [
    // 追加
    'ga:pageViews',
    'ga:sessions',
    'ga:adsenseAdsViewed',
    'ga:adsenseAdsClicks',
    'ga:adsenseRevenue',
  ],[
    // 追加
    'ga:pageTitle',
    'ga:date',
    'ga:pagePath',
    'ga:socialNetwork',
    'ga:fullReferrer',
    'ga:source',
    'ga:yearWeek',
  ]);

  fs.writeFileSync('result-event.json', JSON.stringify(eventRes.data));
  fs.writeFileSync('result-pv.json', JSON.stringify(pvRes.data));

  // console.log(JSON.stringify(eventRes.data));
  // console.log(JSON.stringify(pvRes.data));

  const eventRows = new Map();
  if (eventRes && eventRes.data && eventRes.data.reports && eventRes.data.reports[0] && eventRes.data.reports[0].data && eventRes.data.reports[0].data.rows) {
    eventRes.data.reports[0].data.rows.forEach((r: any) => {
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
  }

  const calced = new Map();

  if (pvRes && pvRes.data && pvRes.data.reports && pvRes.data.reports[0] && pvRes.data.reports[0].data && pvRes.data.reports[0].data.rows) {
    pvRes.data.reports[0].data.rows.forEach((r: any) => {
      const keyPair = uniqKeyPair(r);
      const key = `${keyPair.date}_${keyPair.path}`;

      let row = calced.get(key);
      if ( row ) {
        row['pageViews'] += parseInt(r.metrics[0].values[0]);
      }
      else {
        row = {...keyPair,...{
            pageTitle: r.dimensions[0],
            socialNetwork: r.dimensions[3],
            fullReferrer: r.dimensions[4],
            source: r.dimensions[5],
            pageViews: parseInt(r.metrics[0].values[0])
          }
        };
      }

      const events = eventRows.get(key);
      if ( events ) {
        events.forEach((e: any) => {
          const eventKey = formatEventField(e);

          if (row[eventKey] === undefined) {
            row[eventKey] = parseInt(e.metrics[0].values[0]);
          }
          else {
            row[eventKey] += parseInt(e.metrics[0].values[0]);
          }
        });
      }
      calced.set(key, row);
    });
  }

  console.log(calced.values());
  const byDate = Array.from(calced.values()).reduce((acc, cur) => {
    acc[cur.date] = (acc[cur.date] === undefined) ? [] : acc[cur.date];
    acc[cur.date].push(cur);
    return acc;
  }, {});

  Object.keys(byDate).forEach(date => {
    fs.writeFileSync(`results/result-${date}.json`, JSON.stringify(byDate[date]));
  });
  // fs.writeFileSync('result.json', JSON.stringify(Array.from(calced.values())));
})();


