import { Meteor } from 'meteor/meteor'
import Codes from '../schema'
import Profiles from '../../schema.js'
import { getUserRoles } from '../../users/utils'
import { canDo } from '../../utils/access-control'

Meteor.publish('all.codes', function () {
  // check for permission
  const myRoles = getUserRoles(this.userId)
  if (!canDo({ op: 'readAny', role: myRoles, resource: 'code', log: 'all.codes' })) {
    return this.ready()
  }

  return Codes.find({ bogus: true })
})

Meteor.publish('id.codes', (id) => {
  // check for permission
  const myRoles = getUserRoles(this.userId)
  if (!canDo({ op: 'readAny', role: myRoles, resource: 'code', log: 'id.codes' })) {
    return this.ready()
  }

  return [Codes.find({ _id: id })]
})

Meteor.publish('codes.byUserProfileId', function ({ profileId }) {
  const profile = Profiles.findOne({ _id: profileId })
  if (!profile) {
    throw new Meteor.Error('Profile was not found')
  }
  return Codes.find({ profileId })
})

Meteor.publish('functionInside', function ({ profileId }) {
  // it's okay doing this
  const findProfile = (id) => {
    return Profiles.findOne({ _id: profileId })
  }

  function findUser(id) {
    return Meteor.users.findOne(id)
  }

  const user = findUser('a')

  const profile = findProfile(profileId)
  if (!profile) {
    throw new Meteor.Error('Profile was not found')
  }
  return Codes.find({ profileId })
})
