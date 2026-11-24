import { DomainError, ErrorCode } from "../domain/errors.js";
import { requireText, requireInteger } from "../domain/validation.js";
import { parseRealDate } from "../domain/dates.js";
import { filterEvents, sortEvents } from "../domain/eventSearch.js";
import { EventStatus } from "../domain/inventory.js";

export function createEventService(repository) {
  return {
    async createEvent({ title, city, venue, startsAt }) {
      const t = requireText(title, "title");
      const c = requireText(city, "city");
      const v = requireText(venue, "venue");

      let startsAtIso;
      try {
        startsAtIso = new Date(parseRealDate(startsAt, "startsAt")).toISOString();
      } catch {
        throw new DomainError(ErrorCode.VALIDATION, "startsAt: is not a valid date", { field: "startsAt" });
      }

      return repository.createEvent({
        title: t,
        city: c,
        venue: v,
        startsAt: startsAtIso,
      });
    },

    async addTier(eventId, { name, priceCents, capacity }) {
      const tierName = requireText(name, "name");
      const price = requireInteger(priceCents, "priceCents", { min: 0 });
      const seats = requireInteger(capacity, "capacity", { min: 1 });

      const event = await repository.getEvent(eventId);
      const existingTiers = await repository.listTiers(eventId);
      const clash = existingTiers.some((t) => t.name.toLowerCase() === tierName.toLowerCase());
      if (clash) {
        throw new DomainError(
          ErrorCode.CONFLICT,
          `This event already has a tier named "${tierName}"`,
          { eventId }
        );
      }

      return repository.createTier(eventId, { name: tierName, priceCents: price, capacity: seats });
    },

    async publishEvent(eventId) {
      const event = await repository.getEvent(eventId);
      if (event.status === EventStatus.PUBLISHED) {
        throw new DomainError(ErrorCode.INVALID_STATE, `Event "${eventId}" is already published`);
      }
      if (event.tierIds.length === 0) {
        throw new DomainError(ErrorCode.INVALID_STATE, `Event "${eventId}" has no ticket tiers to publish`);
      }

      return repository.updateEvent(eventId, { status: EventStatus.PUBLISHED });
    },

    async unpublishEvent(eventId) {
      const event = await repository.getEvent(eventId);
      if (event.status === EventStatus.DRAFT) {
        throw new DomainError(ErrorCode.INVALID_STATE, `Event "${eventId}" is already a draft`);
      }

      return repository.updateEvent(eventId, { status: EventStatus.DRAFT });
    },

    async getEventDetail(eventId) {
      const event = await repository.getEvent(eventId);
      if (event.status !== EventStatus.PUBLISHED) {
        throw new DomainError(ErrorCode.NOT_FOUND, `Event not found: ${eventId}`, { Event: eventId });
      }
      const tiers = await repository.listTiers(eventId);
      return {
        id: event.id,
        title: event.title,
        city: event.city,
        venue: event.venue,
        startsAt: event.startsAt,
        status: event.status,
        tiers: tiers.map((t) => ({
          id: t.id,
          eventId: t.eventId,
          name: t.name,
          priceCents: t.priceCents,
          capacity: t.capacity,
          sold: t.sold,
          available: t.capacity - t.sold,
        })),
      };
    },

    async searchEvents(criteria = {}, sortBy = "date") {
      const summaries = await repository.listEvents({ publishedOnly: true });
      const filtered = filterEvents(summaries, criteria);
      return sortEvents(filtered, sortBy);
    },
  };
}