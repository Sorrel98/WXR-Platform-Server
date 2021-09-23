class stack {
    constructor(inMaxSize) {
    //private:
        let data = [];
        let cursor = -1;
        let maxSize = inMaxSize;
        
    //public:
        //Return the maxSize(capacity) of stack
        this.getMaxSize = ()=> {
            return maxSize;
        }
        //If the stack doesn't empty return top obj else return undefined
        this.top = ()=> {
            return cursor === -1 ? undefined : data[cursor];
        };
        //If the stack doesn't empty remove the top obj and return true else return false
        this.pop = ()=> {
            if(cursor === -1) return false;
            data[cursor--] = null;
            return true;
        };
        //If the stack doesn't full push the forwarding obj and return true else return false
        this.push = (obj)=> {
            if(cursor + 1 < maxSize) {
                data[++cursor] = obj;
                return true;
            }
            return false;
        };
        //Return stack's size
        this.size = ()=> {
            return (cursor + 1);
        };
        //Return boolean value which indicate the stack is empty or not
        this.empty = ()=> {
            return (cursor === -1);
        };
        
        this.clear = ()=> {
            while(!this.empty())
                this.pop();
        };
    }
};