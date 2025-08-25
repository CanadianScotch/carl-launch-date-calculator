# Deal Compliance Checker

A HubSpot custom application that automatically validates deal closure and launch dates according to business rules, with manager override workflow via Slack integration.

## Overview

This tool appears as a card on HubSpot deal records and helps ensure deals follow company timing requirements:

- **Automatic Compliance Checking**: Validates dates against business rules in real-time
- **Smart Suggestions**: Provides optimal launch date recommendations  
- **Manager Override Workflow**: Routes non-compliant deals to managers via Slack
- **Date Change Protection**: Monitors and clears approvals when dates change

## Business Rules

1. **Close dates cannot be in the past** (for open deals)
2. **Launch dates must be at least 4 weeks after close date**
3. **Launch dates must be on Mondays** (or Tuesdays if Monday is a federal holiday)
4. **No launch dates in the past**

## Features

- ✅ **Auto-approval** for compliant deals
- 🔧 **One-click fixes** for common date issues
- 📅 **Custom date selection** with instant validation
- 🆘 **Override requests** with Slack notifications
- 🔒 **Permission management** for approvals
- 📊 **Real-time status tracking**

## Quick Start

### Prerequisites

- Active HubSpot account with CRM access
- [HubSpot CLI](https://www.npmjs.com/package/@hubspot/cli) installed
- Access to [CRM Development Tools](https://app.hubspot.com/l/whats-new/betas) (public beta)
- Slack webhook URL for manager notifications

### Installation

1. **Clone and setup:**
   ```bash
   git clone [your-repo-url]
   cd deal-compliance-checker
   hs project dev
   ```

2. **Configure Slack integration:**
   - Add your Slack webhook URL to HubSpot secrets as `SLACK_WEBHOOK_URL`
   - Update manager permissions in `src/app/extensions/Example.jsx` (line 72-80)

3. **Deploy:**
   ```bash
   hs project deploy
   ```

The compliance checker card will appear on deal records automatically.

## Project Structure

```
src/app/
├── extensions/
│   ├── Example.jsx              # Main React component
│   └── example-card.json        # Card configuration
├── app.functions/
│   ├── get-deal-properties.js   # Fetch deal data
│   ├── update-deal-property.js  # Update single property
│   ├── slack-override-notification.js  # Send manager alerts
│   └── serverless.json          # Function definitions
└── app.json                     # App configuration & permissions
```

## Configuration

### Manager Permissions

Update the approval permissions in `Example.jsx`:

```javascript
const checkApprovalPermission = (user) => {
  // Option 1: Specific user IDs
  const superAdminUserIds = [
    60990003, // Add your user IDs here
  ];
  
  // Option 2: Team names
  const allowedTeams = [
    "Revenue",
    "IT, Systems & Compliance"
  ];
  // ... rest of logic
};
```

### HubSpot Properties

The app uses these deal properties (created automatically):
- `compliance_status` - Current violation type
- `override_request_status` - pending/approved/denied/none
- `override_requested_by` - Override requester info
- `override_approved_by` - Approver info
- Plus date tracking fields for approval monitoring

### Slack Integration

Set up a Slack webhook URL in your HubSpot app secrets:
1. Go to your Slack workspace settings
2. Create an incoming webhook for your desired channel
3. Add the webhook URL as `SLACK_WEBHOOK_URL` in HubSpot

## Usage

### For Sales Reps

1. **View Compliance**: Open any deal record to see automatic status
2. **Fix Issues**: Click "Use Suggested" to fix timing/day problems  
3. **Custom Dates**: Enter preferred dates with instant validation
4. **Request Override**: Click "Request Override" for non-compliant deals

### For Managers

1. **Receive Alert**: Get Slack notification for override requests
2. **Review Deal**: Click through to HubSpot for full context
3. **Approve/Deny**: Update approval status in HubSpot
4. **Monitor Changes**: System tracks if dates change after approval

## Troubleshooting

### Common Issues

**Card not appearing:**
- Verify app is deployed and activated
- Check that user has deal record access
- Confirm `objectTypes: [{ "name": "deals" }]` in card config

**Properties not updating:**
- Check HubSpot app permissions include `crm.objects.deals.write`
- Verify private app access token is configured
- Look for errors in function logs

**Slack notifications not working:**
- Confirm `SLACK_WEBHOOK_URL` is set in app secrets
- Test webhook URL directly with curl
- Check Slack channel permissions

**Permission errors:**
- Update `checkApprovalPermission()` function with correct user IDs/teams
- Verify user is in allowed team
- Check HubSpot user object structure in console logs

### Debug Mode

Enable detailed logging by checking browser console when using the card. Key log prefixes:
- `=== COMPLIANCE UPDATE ===` - Rule checking
- `=== SET WITH OVERRIDE DEBUG ===` - Custom date setting
- `=== OVERRIDE REQUEST DEBUG ===` - Manager notifications

### Support

For technical issues:
1. Check browser console for JavaScript errors
2. Review HubSpot function logs in the developer console
3. Test individual serverless functions manually
4. Verify all required HubSpot scopes are granted

## Development

### Local Development

```bash
hs project dev
```

This starts local development server with hot reloading.

### Testing

Test the compliance logic with different deal scenarios:
- Past close dates
- Various RLD timings  
- Federal holidays
- Weekend launch dates

### Contributing

1. Fork the repository
2. Create feature branch
3. Test thoroughly with various deal configurations
4. Submit pull request with clear description

## License

MIT License - see LICENSE.md for details.

---

**Built with HubSpot UI Extensions Framework**
