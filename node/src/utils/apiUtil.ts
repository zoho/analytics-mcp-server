import AnalyticsClient from '../AnalyticsClient';

interface Config {
  CLIENTID: string | undefined;
  CLIENTSECRET: string | undefined;
  REFRESHTOKEN: string | undefined;
  ORGID: string | undefined;
}

export const config: Config = {
  CLIENTID: process.env.ANALYTICS_CLIENT_ID,
  CLIENTSECRET: process.env.ANALYTICS_CLIENT_SECRET,
  REFRESHTOKEN: process.env.ANALYTICS_REFRESH_TOKEN,
  ORGID: process.env.ANALYTICS_ORG_ID
};

export function stripProtocol(raw: string): { clean: string; hadProtocol: boolean } {
  const hadProtocol = /^https?:\/\//i.test(raw);
  const clean = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return { clean, hadProtocol };
}

let analyticsClientInstance: AnalyticsClient | null = null;
export const getAnalyticsClient = (): AnalyticsClient => {
  if (!analyticsClientInstance) {
    if (!config.CLIENTID || !config.CLIENTSECRET || !config.REFRESHTOKEN) {
      throw new Error('Missing required environment variables for AnalyticsClient');
    }

    const accountURI : string | undefined = process.env.ACCOUNTS_SERVER_URL;
    const analyticsURI : string | undefined = process.env.ANALYTICS_SERVER_URL;

    if (accountURI && analyticsURI) {
      const { clean: cleanAccountURI } = stripProtocol(accountURI);
      const { clean: cleanAnalyticsURI } = stripProtocol(analyticsURI);
      analyticsClientInstance = new AnalyticsClient(
        config.CLIENTID,
        config.CLIENTSECRET,
        config.REFRESHTOKEN,
        cleanAnalyticsURI,
        cleanAccountURI
      );
    } else {
      analyticsClientInstance = new AnalyticsClient(
        config.CLIENTID,
        config.CLIENTSECRET,
        config.REFRESHTOKEN
      );
    }
  }
  return analyticsClientInstance;
};


