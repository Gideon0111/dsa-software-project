/* First-in-first-out queue built as a singly linked list */
export class Queue {
  #head = null; 
  #tail = null; 
  #size = 0;

  enqueue(value) {
    const node = { value, next: null };
    if (this.#tail === null) {
      this.#head = node; 
    } else {
      this.#tail.next = node;
    }
    this.#tail = node;
    this.#size++;
  }

  dequeue() {
    if (this.#head === null) return undefined;
    const { value } = this.#head;
    this.#head = this.#head.next;
    if (this.#head === null) this.#tail = null;
    this.#size--;
    return value;
  }

  peek() {
    return this.#head === null ? undefined : this.#head.value;
  }

  get size() {
    return this.#size;
  }

  isEmpty() {
    return this.#size === 0;
  }

  *[Symbol.iterator]() {
    for (let node = this.#head; node !== null; node = node.next) {
      yield node.value;
    }
  }
}