const fs = require('fs');
const {google} = require('googleapis');
const analyticsreporting = google.analyticsreporting('v4');
const moment = require('moment');

// custom dimensionは複数指定すると結果が返ってこない

const viewId = process.argv[2];

const request = async (authClient, range, metrics, dimensions) => {
  const eventTrackPayload = (auth, daterange) => {
    return {
      auth: auth,
      requestBody: {
        reportRequests: {
          viewId: viewId,
          dateRanges: [daterange],
          metrics: [metrics.map((m) => ({expression: m}))],
          dimensions: [dimensions.map((d) => ({name: d}))],
          pageSize: 5000
        }
      }
    }
  };
  return await analyticsreporting.reports.batchGet(eventTrackPayload(authClient, range));
}

const formatEventField = (row) => {
  const onlyCategoryKeys = [
    'ExternalLink',
    'Read'
  ];

  const formatActions = ['scroll'];

  const action = formatActions.includes(row.dimensions[3]) ? row.dimensions[4].replace('%', 'p') : row.dimensions[4];

  return onlyCategoryKeys.includes(row.dimensions[3]) ? row.dimensions[3] : `${row.dimensions[3]}_${action}`;
}

const uniqKeyPair = (row) => {
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

  // 'ga:dimension2',
  // 'ga:dimension3',
  // 'ga:dimension4'

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
  eventRes.data.reports[0].data.rows.forEach(r => {
    const keyPair = uniqKeyPair(r);

    const key = `${keyPair.date}_${keyPair.path}`;
    if ( rowsByKey = eventRows.get(key) ){
      rowsByKey.push(r);
      eventRows.set(key, rowsByKey);
    }
    else {
      eventRows.set(key, [r]);
    }
  });

  const calced = new Map();

  pvRes.data.reports[0].data.rows.forEach(r => {
    const keyPair = uniqKeyPair(r);
    const key = `${keyPair.date}_${keyPair.path}`;

    let row = calced.get(key);
    if ( row ) {
      row['pageViews'] += parseInt(r.metrics[0].values[0]);
    }
    else {
      row = {...{keyPair},...{
          pageTitle: r.dimensions[0],
          socialNetwork: r.dimensions[3],
          fullReferrer: r.dimensions[4],
          source: r.dimensions[5],
          pageViews: parseInt(r.metrics[0].values[0])
        }
      };
    }

    events = eventRows.get(key);
    if ( events ) {
      events.forEach(e => {
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


  console.log(calced.values());
  fs.writeFileSync('result.json', JSON.stringify(Array.from(calced.values())));
})();


