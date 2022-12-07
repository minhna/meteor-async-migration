import { Meteor } from 'meteor/meteor'
import Links from '/imports/api/links/schema'

export const getUserById = (userId) => {
  return Meteor.users.findOne(userId)
}

export const getLinkById = function (userId) {
  return Links.findOne(userId)
}
