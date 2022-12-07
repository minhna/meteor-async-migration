import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import CONSTANTS from '/imports/api/constants'
import Codes from './schema'
import Profiles from '/imports/api/profiles/schema'
import { getMyRoles } from '../users/utils'
import { canDo } from '../utils/access-control'
import { sendTrigger } from '../messages/functions'
const debug = require('debug')('app:codes')

const Cats = new Mongo.Collection('cats')

Meteor.methods({
  'rm.codes': (id) => {
    // check for permission
    const myRoles = getMyRoles()
    if (!canDo({ op: 'deleteAny', role: myRoles, resource: 'code', log: 'rm.codes' })) {
      return { status: 'failed', message: 'Permission denied' }
    }

    try {
      const n = Codes.remove(id)
      return { status: 'success', message: 'Removed code' }
    } catch (e) {
      return {
        status: 'failed',
        message: `Error removing code: ${e.message}`,
      }
    }
  },
  'update.codes': (form) => {
    // check for permission
    const myRoles = getMyRoles()
    if (
      !canDo({ op: 'updateAny', role: myRoles, resource: 'code', log: 'update.codes' })
    ) {
      return { status: 'failed', message: 'Permission denied' }
    }

    try {
      const id = form._id
      delete form._id
      const n = Codes.update(id, { $set: form })
      return { status: 'success', message: `Updated ${n} code(s)` }
    } catch (e) {
      return {
        status: 'failed',
        message: `Error updating code: ${e.message}`,
      }
    }
  },
  'insert.codes': (form) => {
    // check for permission
    const myRoles = getMyRoles()
    if (
      !canDo({ op: 'createAny', role: myRoles, resource: 'code', log: 'insert.codes' })
    ) {
      return { status: 'failed', message: 'Permission denied' }
    }

    try {
      const id = Codes.insert(form)
      return { status: 'success', message: `Added code` }
    } catch (e) {
      return {
        status: 'failed',
        message: `Error adding code: ${e.message}`,
      }
    }
  },
  /**
   * Generate a code for security or other 2FA
   *
   * @param {string} docType
   * @param {integer} minutes before code expires
   * @returns {object} {status: 'success' | 'failed', message: 'An explanation'}
   */
  'generate.codes': async ({ listingId, docType = 'na', minutes = 10 }) => {
    // check for permission
    const myRoles = getMyRoles()
    if (
      !canDo({ op: 'createOwn', role: myRoles, resource: 'code', log: 'generate.codes' })
    ) {
      return { status: 'failed', message: 'Permission denied' }
    }

    try {
      const digits = 4
      const letters = 'X X X X' // This will give 4 digits
        .split(/\s+/)
        .map((x) => Math.floor(Math.random() * 10).toString())
        .join('')
      const form = {
        letters,
        userId: Meteor.userId(),
        docType,
        expires: new Date(Date.now() + minutes * 60 * 1000),
      }
      const id = await Codes.insertAsync(form)
      if (!id) {
        return {
          status: 'failed',
          message: `Failed to insert code`,
        }
      }

      const user = await Meteor.users.findOneAsync({ _id: Meteor.userId() })
      if (!user) {
        return { status: 'failed', message: 'Person was not found' }
      }

      user.roles = Roles.getRolesForUser(user._id)
      user.roles.push('USR')
      const profile = await Profiles.findOneAsync({ userId: user._id })
      user.mobile = profile.mobile
      user.name = profile.name
      user.nickname = profile?.nickname

      const res = sendTrigger({
        listingId,
        people: [user],
        slug: 'security-code-sms',
        message: 'security-code-sms',
        data: { letters },
      })

      if (res?.status === 'failed') {
        return res
      }
      return { status: 'success', message: `Added code` }
    } catch (e) {
      return {
        status: 'failed',
        message: `Error adding code: ${e.message}`,
      }
    }
  },
  'validate.codes': async ({ letters }) => {
    if (!Meteor.userId()) {
      return { status: 'failed', message: 'Permission denied' }
    }

    try {
      const code = await Codes.findOneAsync(
        { letters, userId: Meteor.userId() },
        { hint: 'by_userId_letters' }
      )
      // debug({ userId: Meteor.userId(), letters, code })
      if (!code) return { status: 'failed', message: 'Invalid code' }
      if (code.expires.getTime() < Date.now())
        return {
          status: 'failed',
          message: 'Code is expired, please request another one',
        }
      if (code.status === 'used')
        return {
          status: 'failed',
          message: 'Code has been used already, please request another one',
        }
      const n = await Codes.updateAsync(code._id, { $set: { status: 'used' } })
      if (!n)
        return {
          status: 'failed',
          message: 'Could not set code as used',
        }
      return { status: 'success', message: `Code is valid` }
    } catch (e) {
      return {
        status: 'failed',
        message: `Error validating code: ${e.message}`,
      }
    }
  },
  'invalidate.codes': ({}) => {
    Codes.findOne({})
    if (!Meteor.userId()) {
      return { status: 'failed', message: 'Permission denied' }
    }
    try {
      const userId = Meteor.userId()
      Codes.update({ userId: userId, status: 'active' }, { $set: { status: 'expired' } })

      return { status: 'success', message: 'Successfully invalidated sms codes' }
    } catch (e) {
      return {
        status: 'failed',
        message: `Error when invaliding sms codes: ${e.message}`,
      }
    }
  },
  async 'get.recent.code'() {
    if (!Meteor.userId()) {
      return { status: 'failed', message: 'Permission denied' }
    }
    try {
      // get most recent sms code for testing
      const codes = Codes.find(
        { userId: Meteor.userId(), status: 'active' },
        { hint: 'by_userId_status' }
      ).map((code) => {
        return code.letters
      })
      return {
        status: 'success',
        message: 'Successfully retrieved codes for user',
        codes: codes,
      }
    } catch (e) {
      return { status: 'failed', message: `Error when retrieving code: ${e.message}` }
    }
  },
})

export const someFunction = () => {
  debug('run some function')
  const a = Codes.findOne({})
  Codes.update({ a: 1 }, {})
  Meteor.users.findOne()
  Meteor.users.find({}).fetch()
}

function otherFunction() {
  debug('run other function')
  Codes.findOne()
  Codes.insert({})
  Codes.upsert({})
  Codes.update({})
  Codes.remove({})
  Codes.createIndex({})
  Codes.dropIndex({})
  Codes.dropCollection({})
  // cursors
  Codes.find({}).map((i) => {})
  Codes.find({}).count()
  const a = Codes.find({}).fetch()
  Codes.find({}).forEach((i) => {})
  // cursors variable
  const cursor = Codes.find({})
  cursor.map((i) => {})
}

export const functionShouldStayTheSame = () => {
  return ['a', 'b'].map((i) => `hi ${i}`)
}

Meteor.methods({
  someFunction,
  otherFunction,
  functionShouldStayTheSame,
  alsoThis: functionShouldStayTheSame,
  'literal.method': function ({ p1, p2 }) {
    return Links.find().fetch()
  },
  'literal.method.arrow': ({ p1, p2 }) => {
    const myVar = Links.find()
    return myVar.map((i) => i)
  },
  'cat.all': () => {
    return Cats.find().fetch()
  },
  'cat.byId': ({ id }) => {
    return Cats.findOne({ _id: id })
  },
})
