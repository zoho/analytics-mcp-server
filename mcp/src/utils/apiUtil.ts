import AnalyticsClient from '../sdk/AnalyticsClient';

export const config = {
  CLIENTID: process.env.ANALYTICS_CLIENT_ID,
  CLIENTSECRET: process.env.ANALYTICS_CLIENT_SECRET,
  REFRESHTOKEN: process.env.ANALYTICS_REFRESH_TOKEN,
  ORGID: process.env.ANALYTICS_ORG_ID
};

let analyticsClientInstance: AnalyticsClient | null = null;
export const getAnalyticsClient = (): AnalyticsClient => {
  if (!analyticsClientInstance) {
    if (!config.CLIENTID || !config.CLIENTSECRET || !config.REFRESHTOKEN) {
      const missingVars = [];
      if (!config.CLIENTID) missingVars.push("ANALYTICS_CLIENT_ID");
      if (!config.CLIENTSECRET) missingVars.push("ANALYTICS_CLIENT_SECRET");
      if (!config.REFRESHTOKEN) missingVars.push("ANALYTICS_REFRESH_TOKEN");
      throw new Error(`Missing required environment variables for AnalyticsClient: ${missingVars.join(", ")}` );
    }

    const accountURI : string | undefined = process.env.ACCOUNTS_SERVER_URL;
    const analyticsURI : string | undefined = process.env.ANALYTICS_SERVER_URL;

    if (accountURI && analyticsURI) {
      analyticsClientInstance = new AnalyticsClient(
        config.CLIENTID,
        config.CLIENTSECRET,
        config.REFRESHTOKEN,
        analyticsURI,
        accountURI
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