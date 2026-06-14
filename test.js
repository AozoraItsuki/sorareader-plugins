async function translate(data) {
  const response = await fetch(
    'https://translate-pa.googleapis.com/v1/translateHtml',
    {
      credentials: 'omit',
      headers: {
        'content-type': 'application/json+protobuf',
        'X-Goog-API-Key': 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520',
      },
      referrer: 'https://wtr-lab.com/',
      body: `[[${JSON.stringify(data)},"auto","id"],"te_lib"]`,
      method: 'POST',
    },
  );

  const translated = await response.json();
  return translated;
  const out = translated && translated[0] ? translated[0] : [];

  return out;
}

translate(['hello', 'world']).then(console.log);
