#!/bin/bash

default_start_date=$(date -d "8day ago" "+%Y-%m-%d")
default_end_date=$(date -d "1day ago" "+%Y-%m-%d")
start_date=${1:-$default_start_date}
end_date=${2:-$default_end_date}

echo "start report script"
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
  $(which embulk) run embulk/load.yml.liquid

  current_date=$(date -d "$current_date 1day" "+%Y-%m-%d")
done

