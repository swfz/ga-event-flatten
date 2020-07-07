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
    const date = r.dimensions[1];
    const path = r.dimensions[2].replace(/\?.*/,'');

    const key = `${date}_${path}`;
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
    const date = r.dimensions[1];
    const path = r.dimensions[2].replace(/\?.*/,'');

    const key = `${date}_${path}`;

    let row = calced.get(key);
    if ( row ) {
      row['pageViews'] += parseInt(r.metrics[0].values[0]);
    }
    else {
      row = {
        pageTitle: r.dimensions[0],
        date: date,
        path: path,
        socialNetwork: r.dimensions[3],
        fullReferrer: r.dimensions[4],
        source: r.dimensions[5],
        pageViews: parseInt(r.metrics[0].values[0])
      };
    }

    events = eventRows.get(key);
    if ( events ) {
      events.forEach(e => {
        // /が入ってしまっているものがあるため
        const eventKey = e.dimensions[3] == 'ExternalLink' ? 'ExternalLink' : `${e.dimensions[3]}_${e.dimensions[4]}`.replace(/\/|:|\.|-/g, '_').replace('%','p');

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


