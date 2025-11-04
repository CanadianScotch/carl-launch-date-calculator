const hubspot = require('@hubspot/api-client');

exports.main = async (context = {}) => {
  console.log('getDealProperties function called');
  console.log('Context parameters:', context.parameters);
  
  const { dealId, properties } = context.parameters;
  
  try {
    // Log what we received
    console.log('Deal ID:', dealId);
    console.log('Requested properties:', properties);
    
    // Check if we have access token
    const hasToken = !!process.env.PRIVATE_APP_ACCESS_TOKEN;
    console.log('Has access token:', hasToken);
    
    if (!hasToken) {
      return {
        success: false,
        error: 'No access token found',
        dealId: dealId,
        debugInfo: {
          hasAccessToken: false
        }
      };
    }
    
    // Validate input
    if (!dealId) {
      return {
        success: false,
        error: 'Deal ID is required',
        dealId: dealId
      };
    }

    // Initialize HubSpot client
    console.log('Initializing HubSpot client...');
    const hubspotClient = new hubspot.Client({
      accessToken: process.env.PRIVATE_APP_ACCESS_TOKEN,
    });

    // Default properties if none specified
    const propertiesToFetch = properties || ['seat_count___final', 'closedate', 'requested_launch_date', 'pipeline'];
    console.log('Properties to fetch:', propertiesToFetch);

    // Fetch deal properties from HubSpot API
    console.log('Fetching deal data...');
    const dealResponse = await hubspotClient.crm.deals.basicApi.getById(
      dealId,
      propertiesToFetch
    );
    
    console.log('Deal response received:', dealResponse);
    console.log('Deal properties:', dealResponse.properties);

    // Return the properties data directly (like your example-function.js)
    return {
      ...dealResponse.properties,
      dealId: dealId,
      success: true,
      debugInfo: {
        propertiesFetched: Object.keys(dealResponse.properties),
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('Error fetching deal properties:', error);
    console.error('Error stack:', error.stack);
    
    // Return error response directly
    return {
      success: false,
      error: error.message,
      dealId: dealId,
      requestedProperties: properties,
      debugInfo: {
        hasAccessToken: !!process.env.PRIVATE_APP_ACCESS_TOKEN,
        errorType: error.constructor.name,
        errorStack: error.stack,
        timestamp: new Date().toISOString()
      }
    };
  }
};