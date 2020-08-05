#!/bin/bash

start_date=$1
end_date=$2

result_code=0
npx ts-node index.ts $GA_VIEW_ID $start_date $end_date || result_code=$?

if [ ! "$result_code" = "0" ]; then
  echo "analytics report script failed."
  exit
fi

current_date="$start_date"
while true; do
  echo "$current_date"

  if [ "$current_date" = "$end_date" ] ; then
    break
  fi


  export TARGET_DATE=$(date -d "$current_date" "+%Y%m%d")
  embulk run embulk/report.yml.liquid

  current_date=$(date -d "$current_date 1day" "+%Y-%m-%d")
done

