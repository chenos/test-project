const copy = {
  'navigation.crmTeams': 'Sales teams',
  'crmTeams.title': 'Sales teams',
  'crmTeams.description':
    'Manage team membership; assign business permissions in Permission Sets.',
  'crmTeams.team': 'Team',
  'crmTeams.teamDescription':
    'Create or maintain a sales team; disabled teams have no manager scope.',
  'crmTeams.membership': 'Membership',
  'crmTeams.memberDescription':
    'Each user belongs to one team; membership does not assign a permission set.',
  'crmTeams.newTeam': 'New team',
  'crmTeams.name': 'Name',
  'crmTeams.state': 'Status',
  'crmTeams.enabled': 'Enabled',
  'crmTeams.disabled': 'Disabled',
  'crmTeams.user': 'User',
  'crmTeams.selectUser': 'Select an enabled user',
  'crmTeams.selectTeam': 'Select an enabled team',
  'crmTeams.role': 'Responsibility',
  'crmTeams.sales': 'Sales',
  'crmTeams.manager': 'Sales manager',
  'crmTeams.refresh': 'Refresh',
  'crmTeams.impact':
    'Affected customers: {{count}}. Contacts follow the customer scope.',
  'crmTeams.inconsistent':
    'Membership and manager permissions differ; check Permission Sets.',
  'crmTeams.noTeams': 'Create a team first, then assign members here.',
  'crmTeams.requiredName': 'Enter a name of at most 200 characters.',
  'crmTeams.requiredTeam': 'Select an enabled team.',
  'crmTeams.saved': 'Saved "{{name}}"',
  'crmTeams.disableTitle': 'Disable "{{name}}"?',
  'crmTeams.disableDescription':
    'Managers will lose the affected team scope. Sales retain their own customers.',
  'crmTeams.moveTitle': 'Change the team of "{{name}}"?',
  'crmTeams.moveDescription':
    'The user’s customers and contacts will enter the new team’s manager scope; the previous team will lose access.',
  'crmTeams.confirm': 'Confirm',
  'crmTeams.invalid':
    'Select an enabled user and team, then confirm any team change.',
  'crmTeams.conflict':
    'This record changed. Load the latest version before saving.',
  'crmTeams.ownersOnly':
    'Use Transfer to change the owner; ordinary edits retain the current owner.',
  'crmTeams.transferTitle': 'Transfer customer owner',
  'crmTeams.transfer': 'Transfer',
  'crmTeams.transferUnavailable':
    'This record is outside your transfer scope, or the permission check failed. Refresh the page to check again.',
  'crmTeams.transferred': 'Transferred "{{name}}"',
  'crmTeams.transferDescription':
    'Choose an eligible owner. Contacts follow the customer; opportunities are not changed.',
  'crmPermissions.customers': 'Customers',
  'crmPermissions.contacts': 'Contacts',
  'crmPermissions.owners': 'Owner choices',
  'crmPermissions.ownContacts': 'Contacts of my customers',
  'crmPermissions.team': 'My sales team',
  'crmPermissions.self': 'Myself',
  'crmPermissions.teamUsers': 'Enabled members of my team',
  'crmPermissions.view': 'View',
  'crmPermissions.create': 'Create',
  'crmPermissions.edit': 'Edit ordinary fields',
  'crmPermissions.transfer': 'Transfer owner',
};
export default copy;
