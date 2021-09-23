class list {
    constructor() {
    //private:
        let _head = null;
        let _tail = null;
        let _size = 0;
    
    //public:
        //Return list's size
        this.size = ()=> {
            return _size;
        };
        
        //Return head node
        this.front = ()=> {
            return _head;
        };
        
        //Return tail node
        this.back = ()=> {
            return _tail;
        };
        
        //Search for nodes that match a target
        this.getNode = (target)=> {
            if(!target)
                return null;
            if(_head === null)
                return null;
            for(let node = _head; node !== null; node = node.next) {
                if(node.item === target)
                    return node;
            }
            return null;
        };
        
        //Search for nodes that match a predicate function
        this.findNodeIf = (predicate)=> {
            if(_head === null)
                return null;
            for(let node = _head; node !== null; node = node.next) {
                if(predicate(node.item))
                    return node;
            }
            return null;
        };
        
        //Insert item to head
        this.pushFront = (target)=> {
            if(!target)
                return;
            let newNode = {item: target, prev: null, next: null, container: this};
            if(_head) {
                newNode.next = _head;
                _head.prev = newNode;
            }
            _head = newNode;
            if(++_size === 1)
                _tail = newNode;
        };
        
        //Remove node from head
        this.popFront = ()=> {
            if(_head) {
                if(_head.next) {
                    _head.next.prev = null;
                }
                _head = _head.next;
                if(--_size === 0)
                    _tail = null;
            }
        };
        
        //Insert item to tail
        this.pushBack = (target)=> {
            if(!target)
                reteurn;
            let newNode = {item: target, prev: null, next: null, container: this};
            if(_tail) {
                _tail.next = newNode;
                newNode.prev = _tail;
            }
            _tail = newNode;
            if(++_size === 1)
                _head = newNode;
        };
        
        //Remove node from tail
        this.popBack = ()=> {
            if(_tail) {
                if(_tail.prev) {
                    _tail.prev.next = null;
                }
                _tail = _tail.prev;
                if(--_size === 0)
                    _head = null;
            }
        };
  
        //Remove node anywhere
        this.removeNode = (nd)=> {
            if(nd.container !== this)
                return;
            if(nd === _head)
                this.popFront();
            else if(nd === _tail)
                this.popBack();
            else {
                nd.prev.next = nd.next;
                nd.next.prev = nd.prev;
                --_size;
            }
        };
        
        //Insert item anywhere
        this.insertItem = (item, where)=> {
            if(where.container !== this)
                return;
            if(where === _head)
                this.pushFront(item);
            else if(where === _tail)
                this.pushBack(item);
            else {
                let newNode = {item: item, prev: where.prev, next: where, container: this};
                where.prev.next = newNode;
                where.prev = newNode;
                ++_size;
            }
        };
        
        //Return boolean value which indicate the stack is empty or not
        this.empty = ()=> {
            return (_size === 0);
        };
        
        this.clear = ()=> {
            while(!this.empty())
                this.popFront();
        };
    }

    //Support iterator
	*[Symbol.iterator]() {
		for(let it = this.front(); it; it = it.next) {
			yield it.item;
		}
	};
};