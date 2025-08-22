const hubspot = require('@hubspot/api-client');

exports.main = async (context = {}) => {
  console.log('updateDealProperty function called');
  console.log('Context parameters:', context.parameters);
  
  const { dealId, property, value } = context.parameters;
  
  try {
    // Validate input
    if (!dealId) {
      return {
        success: false,
        error: 'Deal ID is required'
      };
    }
    
    if (!property) {
      return {
        success: false,
        error: 'Property name is required'
      };
    }
    
    if (value === undefined || value === null) {
      return {
        success: false,
        error: 'Property value is required'
      };
    }

    // Check if we have access token
    const hasToken = !!process.env.PRIVATE_APP_ACCESS_TOKEN;
    console.log('Has access token:', hasToken);
    
    if (!hasToken) {
      return {
        success: false,
        error: 'No access token found'
      };
    }

    // Initialize HubSpot client
    console.log('Initializing HubSpot client...');
    const hubspotClient = new hubspot.Client({
      accessToken: process.env.PRIVATE_APP_ACCESS_TOKEN,
    });

    // Prepare the update data
    const updateData = {
      properties: {
        [property]: value
      }
    };
    
    console.log('Updating deal with data:', updateData);

    // Update the deal property
    const updateResponse = await hubspotClient.crm.deals.basicApi.update(
      dealId,
      updateData
    );
    
    console.log('Deal updated successfully:', updateResponse);

    return {
      success: true,
      dealId: dealId,
      property: property,
      value: value,
      updatedAt: new Date().toISOString(),
      hubspotResponse: {
        id: updateResponse.id,
        updatedAt: updateResponse.updatedAt
      }
    };

  } catch (error) {
    console.error('Error updating deal property:', error);
    console.error('Error stack:', error.stack);
    
    return {
      success: false,
      error: error.message,
      dealId: dealId,
      property: property,
      value: value,
      debugInfo: {
        hasAccessToken: !!process.env.PRIVATE_APP_ACCESS_TOKEN,
        errorType: error.constructor.name,
        timestamp: new Date().toISOString()
      }
    };
  }
};