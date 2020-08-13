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

type Unpacked<T> = T extends { [K in keyof T]: infer U } ? U : never;

const keyDimensions = ['date', 'pagePath'] as const;
const pvDimensions = ['pageTitle', 'yearWeek'] as const;
const eventDimensions = ['pageTitle', 'yearWeek', 'eventCategory', 'eventAction', 'eventLabel'] as const;
const pvMetrics = ['pageViews', 'sessions', 'adsenseAdsViewed', 'adsenseAdsClicks', 'adsenseRevenue'] as const;
const eventMetrics = ['totalEvents'] as const;

type KeyDimension = Unpacked<typeof keyDimensions>;
type PvDimension = Unpacked<typeof pvDimensions>;
type EventDimension = Unpacked<typeof eventDimensions>;
type PvMetrics = Unpacked<typeof pvMetrics>;
type EventMetrics = Unpacked<typeof eventMetrics>;
type Dimension = KeyDimension | PvDimension | EventDimension;
type Metrics = PvMetrics | EventMetrics;
type GaKey = Dimension | Metrics;

const toEnum = (keys: GaKey[]) => {
  return keys.reduce((acc, cur: GaKey, i: number) => {
    acc[i] = cur;
    acc[cur] = i;
    return acc;
    }, {} as {[key in GaKey]: number} & {[key: number]: GaKey});
}

const keyDimensionEnum = toEnum([...keyDimensions]);
const pvDimensionEnum = toEnum([...keyDimensions, ...pvDimensions]);
const eventDimensionEnum = toEnum([...keyDimensions, ...eventDimensions]);
const pvMetricsEnum = toEnum([...pvMetrics]);
const eventMetricsEnum = toEnum([...eventMetrics]);

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

  const action = formatActions.includes(row.dimensions[eventDimensionEnum.eventCategory]) ?
    row.dimensions[eventDimensionEnum.eventAction].replace('%', 'p') :
    row.dimensions[eventDimensionEnum.eventAction];

  return onlyCategoryKeys.includes(row.dimensions[eventDimensionEnum.eventCategory]) ?
    row.dimensions[eventDimensionEnum.eventCategory] :
    `${row.dimensions[eventDimensionEnum.eventCategory]}_${action}`;
}

const uniqKeyPair = (row: any) => {
  const date = row.dimensions[keyDimensionEnum.date];
  const path = row.dimensions[keyDimensionEnum.pagePath].replace(/\?.*/,'');

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

  const startDate = process.argv[3] ?? moment().add(-8, 'days').format('YYYY-MM-DD');
  const endDate = process.argv[4] ?? moment().add(-1, 'days').format('YYYY-MM-DD');
  const last7DaysRange = {startDate, endDate};

  const eventRes = await request(authClient, last7DaysRange, [
    ...toGaKeys(eventMetricsEnum)
],[
    ...toGaKeys(eventDimensionEnum)
  ]);

  const pvRes = await request(authClient, last7DaysRange, [
    ...toGaKeys(pvMetricsEnum)
  ],[
    ...toGaKeys(pvDimensionEnum)
  ]);

  // fs.writeFileSync('result-event.json', JSON.stringify(eventRes.data));
  // fs.writeFileSync('result-pv.json', JSON.stringify(pvRes.data));

  const reportData = (response: any): any => {
    return response?.data?.reports?.[0]?.data?.rows ?? [];
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
      toStringKeys(pvMetricsEnum).forEach((m: any) => {
        const value = r.metrics[pvMetricsEnum[m]] ? parseFloat(r.metrics[pvMetricsEnum[m]].values[0]) : 0.0;
        row[m] += value;
      });
    }
    else {
      row = {...keyPair,...{
          pageTitle: r.dimensions[pvDimensionEnum.pageTitle],
          yearWeek: r.dimensions[pvDimensionEnum.yearWeek],
        }
      };
      toStringKeys(pvMetricsEnum).forEach((m: any) => {
        const value = r.metrics[pvMetricsEnum[m]] ? parseFloat(r.metrics[pvMetricsEnum[m]].values[0]) : 0.0;
        row[m] = value;
      });
    }

    const events = eventRows.get(key);
    if ( events ) {
      events.forEach((e: any) => {
        const eventKey = formatEventField(e);

        if (row[eventKey] === undefined) {
          row[eventKey] = parseInt(e.metrics[eventMetricsEnum.totalEvents].values[0]);
        }
        else {
          row[eventKey] += parseInt(e.metrics[eventMetricsEnum.totalEvents].values[0]);
        }
      });
    }
    calced.set(key, row);
  });

  // console.log(calced.values());
  const byDate = Array.from(calced.values()).reduce((acc, cur) => {
    acc[cur.date] = acc[cur.date] ?? [];
    acc[cur.date].push(cur);
    return acc;
  }, {});

  Object.keys(byDate).forEach(date => {
    fs.writeFileSync(`results/result-${date}.json`, JSON.stringify(byDate[date]));
  });
})();


